/*
Copyright 2025 New Vector Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type E2EEOptions } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
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
  from,
  fromEvent,
  map,
  type Observable,
  of,
  scan,
  startWith,
  switchMap,
} from "rxjs";
import { multiSfu } from "../../settings/settings";
import { type Behavior } from "../Behavior";
import { ConnectionManager } from "../remoteMembers/ConnectionManager";
import { makeTransport } from "../../rtcSessionHelpers";
import { type ObservableScope } from "../ObservableScope";
import { async$, unwrapAsync } from "../Async";
import { Publisher } from "./Publisher";
import { type MuteStates } from "../MuteStates";
import { type ProcessorState } from "../../livekit/TrackProcessorContext";
import { type MediaDevices } from "../../state/MediaDevices";
import { and$ } from "../../utils/observable";
import { areLivekitTransportsEqual } from "../remoteMembers/matrixLivekitMerger";

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
  client: MatrixClient;
  preferStickyEvents: boolean;
  roomId: string;
  e2eeLivekitOptions: E2EEOptions | undefined;
  trackerProcessorState$: Behavior<ProcessorState>;
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
export const ownMembership$ = ({
  scope,
  muteStates,
  mediaDevices,
  preferStickyEvents,
  connectionManager,
  matrixRTCSession,
  matrixRoom,
  e2eeLivekitOptions,
  client,
  roomId,
  trackerProcessorState$,
}: Props): {
  // publisher: Publisher
  requestJoin(): Observable<JoinedStateWithErrors>;
  startTracks(): Track[];
} => {
  // This should be used in a combineLatest with publisher$ to connect.
  const shouldStartTracks$ = BehaviorSubject(false);

  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const startTracks = () => {
    shouldStartTracks$.next(true);
  };

  const userId = client.getUserId()!;
  const deviceId = client.getDeviceId()!;
  const multiSfu$ = multiSfu.value$;
  /**
   * The transport that we would personally prefer to publish on (if not for the
   * transport preferences of others, perhaps).
   */
  const preferredTransport$: Behavior<LivekitTransport> = scope.behavior(
    from(makeTransport(client, roomId)),
  );

  connectionManager.registerTransports(
    scope.behavior(preferredTransport$.pipe(map((t) => (t ? [t] : [])))),
  );

  const connection$ = scope.behavior(
    combineLatest([connectionManager.connections$, preferredTransport$]).pipe(
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
  // DISCUSSION own membership manager
  const matrixConnected$ = scope.behavior(
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

  /**
   * Whether we are "fully" connected to the call. Accounts for both the
   * connection to the MatrixRTC session and the LiveKit publish connection.
   */
  const connected$ = scope.behavior(
    and$(
      matrixConnected$,
      connection$.pipe(
        switchMap((c) =>
          c
            ? c.state$.pipe(map((state) => state.state === "ConnectedToLkRoom"))
            : of(false),
        ),
      ),
    ),
  );

  const publisher = scope.behavior(
    connection$.pipe(
      map((c) =>
        c
          ? new Publisher(
              scope,
              c,
              mediaDevices,
              muteStates,
              e2eeLivekitOptions,
              trackerProcessorState$,
            )
          : null,
      ),
    ),
  );

  // HOW IT WAS PREVIEOUSLY CREATED
  // new PublishConnection(
  //   {
  //     transport,
  //     client: this.matrixRoom.client,
  //     scope,
  //     remoteTransports$: this.remoteTransports$,
  //     livekitRoomFactory: this.options.livekitRoomFactory,
  //   },
  //   this.mediaDevices,
  //   this.muteStates,
  //   this.e2eeLivekitOptions(),
  //   this.scope.behavior(this.trackProcessorState$),
  // ),

  /**
   * The transport over which we should be actively publishing our media.
   * null when not joined.
   */
  // DISCUSSION ownMembershipManager
  const localTransport$: Behavior<LivekitTransport | null> =
    this.scope.behavior(
      this.transports$.pipe(
        map((transports) => transports?.local ?? null),
        distinctUntilChanged<LivekitTransport | null>(deepCompare),
      ),
    );

  /**
   * The transport we should advertise in our MatrixRTC membership (plus whether
   * it is a multi-SFU transport and whether we should use sticky events).
   */
  // DISCUSSION ownMembershipManager
  const advertisedTransport$: Behavior<{
    multiSfu: boolean;
    preferStickyEvents: boolean;
    transport: LivekitTransport;
  } | null> = this.scope.behavior(
    this.transports$.pipe(
      map((transports) =>
        transports?.local.state === "ready" &&
        transports.preferred.state === "ready"
          ? {
              multiSfu: transports.multiSfu,
              preferStickyEvents: transports.preferStickyEvents,
              // In non-multi-SFU mode we should always advertise the preferred
              // SFU to minimize the number of membership updates
              transport: transports.multiSfu
                ? transports.local.value
                : transports.preferred.value,
            }
          : null,
      ),
      distinctUntilChanged<{
        multiSfu: boolean;
        preferStickyEvents: boolean;
        transport: LivekitTransport;
      } | null>(deepCompare),
    ),
  );

  // MATRIX RELATED

  /**
   * Whether we should tell the user that we're reconnecting to the call.
   */
  // DISCUSSION own membership manager
  const reconnecting$ = scope.behavior(
    connected$.pipe(
      // We are reconnecting if we previously had some successful initial
      // connection but are now disconnected
      scan(
        ({ connectedPreviously }, connectedNow) => ({
          connectedPreviously: connectedPreviously || connectedNow,
          reconnecting: connectedPreviously && !connectedNow,
        }),
        { connectedPreviously: false, reconnecting: false },
      ),
      map(({ reconnecting }) => reconnecting),
    ),
  );
  return { connected$, transport$: preferredTransport$, publisher };
};
