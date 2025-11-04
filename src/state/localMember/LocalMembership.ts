/*
Copyright 2025 New Vector Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LocalTrack, type E2EEOptions } from "livekit-client";
import {
  type LivekitTransport,
  type MatrixRTCSession,
  MembershipManagerEvent,
  Status,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  ClientEvent,
  type MatrixClient,
  SyncState,
  type Room as MatrixRoom,
} from "matrix-js-sdk";
import {
  BehaviorSubject,
  combineLatest,
  fromEvent,
  map,
  type Observable,
  of,
  startWith,
  switchMap,
  tap,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../Behavior";
import { type ConnectionManager } from "../remoteMembers/ConnectionManager";
import { type ObservableScope } from "../ObservableScope";
import { Publisher } from "./Publisher";
import { type MuteStates } from "../MuteStates";
import { type ProcessorState } from "../../livekit/TrackProcessorContext";
import { type MediaDevices } from "../MediaDevices";
import { and$ } from "../../utils/observable";
import { areLivekitTransportsEqual } from "../remoteMembers/matrixLivekitMerger";
import {
  enterRTCSession,
  type EnterRTCSessionOptions,
} from "../../rtcSessionHelpers";

/*
 * - get well known
 * - get oldest membership
 * - get transport to use
 * - get openId + jwt token
 * - wait for createTrack() call
 *    - create tracks
 * - wait for join() call
 *   - Publisher.publishTracks()
 *   - send join state/sticky event
 */
interface Props {
  scope: ObservableScope;
  mediaDevices: MediaDevices;
  muteStates: MuteStates;
  connectionManager: ConnectionManager;
  matrixRTCSession: MatrixRTCSession;
  matrixRoom: MatrixRoom;
  localTransport$: Behavior<LivekitTransport>;
  client: MatrixClient;
  roomId: string;
  e2eeLivekitOptions: E2EEOptions | undefined;
  trackerProcessorState$: Behavior<ProcessorState>;
}
enum LivekitState {
  UNINITIALIZED = "uninitialized",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
  DISCONNECTED = "disconnected",
  DISCONNECTING = "disconnecting",
}
type LocalMemberLivekitState =
  | { state: LivekitState.ERROR; error: string }
  | { state: LivekitState.CONNECTED }
  | { state: LivekitState.CONNECTING }
  | { state: LivekitState.UNINITIALIZED }
  | { state: LivekitState.DISCONNECTED }
  | { state: LivekitState.DISCONNECTING };

enum MatrixState {
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
}
type LocalMemberMatrixState =
  | { state: MatrixState.CONNECTED }
  | { state: MatrixState.CONNECTING }
  | { state: MatrixState.DISCONNECTED };

interface LocalMemberState {
  livekit$: BehaviorSubject<LocalMemberLivekitState>;
  matrix$: BehaviorSubject<LocalMemberMatrixState>;
}
/**
 * This class is responsible for managing the own membership in a room.
 * We want
 *  - a publisher
 *  -
 * @param param0
 * @returns
 *  - publisher: The handle to create tracks and publish them to the room.
 *  - connected$: the current connection state. Including matrix server and livekit server connection. (only the livekit server relevant for our own participation)
 *  - transport$: the transport object the ownMembership$ ended up using.
 *
 */
export const localMembership$ = ({
  scope,
  muteStates,
  mediaDevices,
  connectionManager,
  matrixRTCSession,
  localTransport$,
  matrixRoom,
  e2eeLivekitOptions,
  trackerProcessorState$,
}: Props): {
  // publisher: Publisher
  requestConnect: (options: EnterRTCSessionOptions) => LocalMemberState;
  startTracks: () => Behavior<LocalTrack[]>;
  requestDisconnect: () => Observable<LocalMemberLivekitState> | null;
  state: LocalMemberState; // TODO this is probably superseeded by joinState$
  homeserverConnected$: Behavior<boolean>;
  connected$: Behavior<boolean>;
} => {
  const state = {
    livekit$: new BehaviorSubject<LocalMemberLivekitState>({
      state: LivekitState.UNINITIALIZED,
    }),
    matrix$: new BehaviorSubject<LocalMemberMatrixState>({
      state: MatrixState.DISCONNECTED,
    }),
  };

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const shouldStartTracks$ = new BehaviorSubject(false);

  // This should be used in a combineLatest with publisher$ to connect.
  const tracks$ = new BehaviorSubject<LocalTrack[]>([]);

  const connection$ = scope.behavior(
    combineLatest([connectionManager.connections$, localTransport$]).pipe(
      map(([connections, transport]) =>
        connections.find((connection) =>
          areLivekitTransportsEqual(connection.transport, transport),
        ),
      ),
    ),
  );
  /**
   * Whether we are connected to the MatrixRTC session.
   */
  const homeserverConnected$ = scope.behavior(
    // To consider ourselves connected to MatrixRTC, we check the following:
    and$(
      // The client is connected to the sync loop
      (
        fromEvent(matrixRoom.client, ClientEvent.Sync) as Observable<
          [SyncState]
        >
      ).pipe(
        startWith([matrixRoom.client.getSyncState()]),
        map(([state]) => state === SyncState.Syncing),
      ),
      // Room state observed by session says we're connected
      fromEvent(matrixRTCSession, MembershipManagerEvent.StatusChanged).pipe(
        startWith(null),
        map(() => matrixRTCSession.membershipStatus === Status.Connected),
      ),
      // Also watch out for warnings that we've likely hit a timeout and our
      // delayed leave event is being sent (this condition is here because it
      // provides an earlier warning than the sync loop timeout, and we wouldn't
      // see the actual leave event until we reconnect to the sync loop)
      fromEvent(matrixRTCSession, MembershipManagerEvent.ProbablyLeft).pipe(
        startWith(null),
        map(() => matrixRTCSession.probablyLeft !== true),
      ),
    ),
  );

  // /**
  //  * Whether we are "fully" connected to the call. Accounts for both the
  //  * connection to the MatrixRTC session and the LiveKit publish connection.
  //  */
  // // TODO use this in combination with the MemberState.
  const connected$ = scope.behavior(
    and$(
      homeserverConnected$,
      connection$.pipe(
        switchMap((c) =>
          c
            ? c.state$.pipe(map((state) => state.state === "ConnectedToLkRoom"))
            : of(false),
        ),
      ),
    ),
  );

  const publisher$ = scope.behavior(
    connection$.pipe(
      map((connection) =>
        connection
          ? new Publisher(
              scope,
              connection,
              mediaDevices,
              muteStates,
              e2eeLivekitOptions,
              trackerProcessorState$,
            )
          : null,
      ),
    ),
  );

  combineLatest(
    [publisher$, shouldStartTracks$],
    (publisher, shouldStartTracks) => {
      if (publisher && shouldStartTracks) {
        publisher
          .createAndSetupTracks()
          .then((tracks) => {
            tracks$.next(tracks);
          })
          .catch((error) => {
            logger.error("Error creating tracks:", error);
          });
      }
    },
  );

  // MATRIX RELATED

  // /**
  //  * Whether we should tell the user that we're reconnecting to the call.
  //  */
  // // DISCUSSION own membership manager
  // const reconnecting$ = scope.behavior(
  //   connected$.pipe(
  //     // We are reconnecting if we previously had some successful initial
  //     // connection but are now disconnected
  //     scan(
  //       ({ connectedPreviously }, connectedNow) => ({
  //         connectedPreviously: connectedPreviously || connectedNow,
  //         reconnecting: connectedPreviously && !connectedNow,
  //       }),
  //       { connectedPreviously: false, reconnecting: false },
  //     ),
  //     map(({ reconnecting }) => reconnecting),
  //   ),
  // );

  const startTracks = (): Behavior<LocalTrack[]> => {
    shouldStartTracks$.next(true);
    return tracks$;
  };

  // const joinState$ = new BehaviorSubject<LocalMemberLivekitState>({
  //   state: LivekitState.UNINITIALIZED,
  // });

  const requestConnect = (
    options: EnterRTCSessionOptions,
  ): LocalMemberState => {
    if (state.livekit$.value === null) {
      startTracks();
      state.livekit$.next({ state: LivekitState.CONNECTING });
      combineLatest([publisher$, tracks$], (publisher, tracks) => {
        publisher
          ?.startPublishing()
          .then(() => {
            state.livekit$.next({ state: LivekitState.CONNECTED });
          })
          .catch((error) => {
            state.livekit$.next({ state: LivekitState.ERROR, error });
          });
      });
    }
    if (state.matrix$.value.state !== MatrixState.DISCONNECTED) {
      state.matrix$.next({ state: MatrixState.CONNECTING });
      localTransport$.pipe(
        tap((transport) => {
          enterRTCSession(matrixRTCSession, transport, options).catch(
            (error) => {
              logger.error(error);
            },
          );
        }),
      );
    }
    return state;
  };

  const requestDisconnect = (): Behavior<LocalMemberLivekitState> | null => {
    if (state.livekit$.value.state !== LivekitState.CONNECTED) return null;
    state.livekit$.next({ state: LivekitState.DISCONNECTING });
    combineLatest([publisher$, tracks$], (publisher, tracks) => {
      publisher
        ?.stopPublishing()
        .then(() => {
          tracks.forEach((track) => track.stop());
          state.livekit$.next({ state: LivekitState.DISCONNECTED });
        })
        .catch((error) => {
          state.livekit$.next({ state: LivekitState.ERROR, error });
        });
    });

    return state.livekit$;
  };

  return {
    startTracks,
    requestConnect,
    requestDisconnect,
    state,
    homeserverConnected$,
    connected$,
  };
};
