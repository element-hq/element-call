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
import { ClientEvent, SyncState, type Room as MatrixRoom } from "matrix-js-sdk";
import {
  BehaviorSubject,
  combineLatest,
  fromEvent,
  map,
  NEVER,
  type Observable,
  of,
  scan,
  startWith,
  switchMap,
  take,
  takeWhile,
  tap,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { sharingScreen$ as observeSharingScreen$ } from "../../UserMedia.ts";
import { type Behavior } from "../../Behavior";
import { type IConnectionManager } from "../remoteMembers/ConnectionManager";
import { ObservableScope } from "../../ObservableScope";
import { Publisher } from "./Publisher";
import { type MuteStates } from "../../MuteStates";
import { type ProcessorState } from "../../../livekit/TrackProcessorContext";
import { type MediaDevices } from "../../MediaDevices";
import { and$ } from "../../../utils/observable";
import {
  enterRTCSession,
  type EnterRTCSessionOptions,
} from "../../../rtcSessionHelpers";
import { type ElementCallError } from "../../../utils/errors";
import { ElementWidgetActions, type WidgetHelpers } from "../../../widget";
import { areLivekitTransportsEqual } from "../remoteMembers/MatrixLivekitMembers";
import { getUrlParams } from "../../../UrlParams.ts";

export enum LivekitState {
  Uninitialized = "uninitialized",
  Connecting = "connecting",
  Connected = "connected",
  Error = "error",
  Disconnected = "disconnected",
  Disconnecting = "disconnecting",
}
type LocalMemberLivekitState =
  | { state: LivekitState.Error; error: string }
  | { state: LivekitState.Connected }
  | { state: LivekitState.Connecting }
  | { state: LivekitState.Uninitialized }
  | { state: LivekitState.Disconnected }
  | { state: LivekitState.Disconnecting };

export enum MatrixState {
  Connected = "connected",
  Disconnected = "disconnected",
  Connecting = "connecting",
}
type LocalMemberMatrixState =
  | { state: MatrixState.Connected }
  | { state: MatrixState.Connecting }
  | { state: MatrixState.Disconnected };

export interface LocalMemberConnectionState {
  livekit$: BehaviorSubject<LocalMemberLivekitState>;
  matrix$: BehaviorSubject<LocalMemberMatrixState>;
}

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
  options: Behavior<EnterRTCSessionOptions>;
  scope: ObservableScope;
  mediaDevices: MediaDevices;
  muteStates: MuteStates;
  connectionManager: IConnectionManager;
  matrixRTCSession: MatrixRTCSession;
  matrixRoom: MatrixRoom;
  localTransport$: Behavior<LivekitTransport | undefined>;
  e2eeLivekitOptions: E2EEOptions | undefined;
  trackProcessorState$: Behavior<ProcessorState>;
  widget: WidgetHelpers | null;
}

/**
 * This class is responsible for managing the own membership in a room.
 * We want
 *  - a publisher
 *  -
 * @param param0
 * @returns
 *  - publisher: The handle to create tracks and publish them to the room.
 *  - connected$: the current connection state. Including matrix server and livekit server connection. (only considering the livekit server we are using for our own media publication)
 *  - transport$: the transport object the ownMembership$ ended up using.
 *  - connectionState: the current connection state. Including matrix server and livekit server connection.
 *  - sharingScreen$: Whether we are sharing our screen. `undefined` if we cannot share the screen.
 */
export const createLocalMembership$ = ({
  scope,
  options,
  muteStates,
  mediaDevices,
  connectionManager,
  matrixRTCSession,
  localTransport$,
  matrixRoom,
  e2eeLivekitOptions,
  trackProcessorState$,
  widget,
}: Props): {
  // publisher: Publisher
  requestConnect: () => LocalMemberConnectionState;
  startTracks: () => Behavior<LocalTrack[]>;
  requestDisconnect: () => Observable<LocalMemberLivekitState> | null;
  connectionState: LocalMemberConnectionState;
  sharingScreen$: Behavior<boolean | undefined>;
  toggleScreenSharing: (() => void) | null;

  // deprecated fields
  /** @deprecated use state instead*/
  homeserverConnected$: Behavior<boolean>;
  /** @deprecated use state instead*/
  connected$: Behavior<boolean>;
  // this needs to be discussed
  /** @deprecated use state instead*/
  reconnecting$: Behavior<boolean>;
  // also needs to be disccues
  /** @deprecated use state instead*/
  configError$: Behavior<ElementCallError | null>;
} => {
  const state = {
    livekit$: new BehaviorSubject<LocalMemberLivekitState>({
      state: LivekitState.Uninitialized,
    }),
    matrix$: new BehaviorSubject<LocalMemberMatrixState>({
      state: MatrixState.Disconnected,
    }),
  };

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const shouldStartTracks$ = new BehaviorSubject(false);

  // This should be used in a combineLatest with publisher$ to connect.
  const tracks$ = new BehaviorSubject<LocalTrack[]>([]);

  // Drop Epoch data here since we will not combine this anymore
  const connection$ = scope.behavior(
    combineLatest(
      [connectionManager.connections$, localTransport$],
      (connections, transport) => {
        if (transport === undefined) return undefined;
        return connections.value.find((connection) =>
          areLivekitTransportsEqual(connection.transport, transport),
        );
      },
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
              trackProcessorState$,
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
  // DISCUSSION is there a better way to do this?
  // sth that is more deriectly implied from the membership manager of the js sdk. (fromEvent(matrixRTCSession, Reconnecting)) ??? or similar
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

  const startTracks = (): Behavior<LocalTrack[]> => {
    shouldStartTracks$.next(true);
    return tracks$;
  };

  const requestConnect = (): LocalMemberConnectionState => {
    if (state.livekit$.value.state === LivekitState.Uninitialized) {
      startTracks();
      state.livekit$.next({ state: LivekitState.Connecting });
      combineLatest([publisher$, tracks$], (publisher, tracks) => {
        publisher
          ?.startPublishing()
          .then(() => {
            state.livekit$.next({ state: LivekitState.Connected });
          })
          .catch((error) => {
            state.livekit$.next({ state: LivekitState.Error, error });
          });
      });
    }
    if (state.matrix$.value.state === MatrixState.Disconnected) {
      state.matrix$.next({ state: MatrixState.Connecting });
      localTransport$.pipe(
        tap((transport) => {
          if (transport !== undefined) {
            enterRTCSession(matrixRTCSession, transport, options.value).catch(
              (error) => {
                logger.error(error);
              },
            );
          } else {
            logger.info("Waiting for transport to enter rtc session");
          }
        }),
      );
    }
    return state;
  };

  const requestDisconnect = (): Behavior<LocalMemberLivekitState> | null => {
    if (state.livekit$.value.state !== LivekitState.Connected) return null;
    state.livekit$.next({ state: LivekitState.Disconnecting });
    combineLatest([publisher$, tracks$], (publisher, tracks) => {
      publisher
        ?.stopPublishing()
        .then(() => {
          tracks.forEach((track) => track.stop());
          state.livekit$.next({ state: LivekitState.Disconnected });
        })
        .catch((error) => {
          state.livekit$.next({ state: LivekitState.Error, error });
        });
    });

    return state.livekit$;
  };

  // Pause upstream of all local media tracks when we're disconnected from
  // MatrixRTC, because it can be an unpleasant surprise for the app to say
  // 'reconnecting' and yet still be transmitting your media to others.
  // We use matrixConnected$ rather than reconnecting$ because we want to
  // pause tracks during the initial joining sequence too until we're sure
  // that our own media is displayed on screen.
  combineLatest([connection$, homeserverConnected$])
    .pipe(scope.bind())
    .subscribe(([connection, connected]) => {
      if (connection?.state$.value.state !== "ConnectedToLkRoom") return;
      const publications =
        connection.livekitRoom.localParticipant.trackPublications.values();
      if (connected) {
        for (const p of publications) {
          if (p.track?.isUpstreamPaused === true) {
            const kind = p.track.kind;
            logger.log(`Resuming ${kind} track (MatrixRTC connection present)`);
            p.track
              .resumeUpstream()
              .catch((e) =>
                logger.error(
                  `Failed to resume ${kind} track after MatrixRTC reconnection`,
                  e,
                ),
              );
          }
        }
      } else {
        for (const p of publications) {
          if (p.track?.isUpstreamPaused === false) {
            const kind = p.track.kind;
            logger.log(
              `Pausing ${kind} track (uncertain MatrixRTC connection)`,
            );
            p.track
              .pauseUpstream()
              .catch((e) =>
                logger.error(
                  `Failed to pause ${kind} track after entering uncertain MatrixRTC connection`,
                  e,
                ),
              );
          }
        }
      }
    });

  const configError$ = new BehaviorSubject<ElementCallError | null>(null);
  // TODO I do not fully understand what this does.
  // Is it needed?
  // Is this at the right place?
  // Can this be simplified?
  // Start and stop session membership as needed
  scope.reconcile(localTransport$, async (advertised) => {
    if (advertised !== null && advertised !== undefined) {
      try {
        configError$.next(null);
        await enterRTCSession(matrixRTCSession, advertised, options.value);
      } catch (e) {
        logger.error("Error entering RTC session", e);
      }

      // Update our member event when our mute state changes.
      const intentScope = new ObservableScope();
      intentScope.reconcile(muteStates.video.enabled$, async (videoEnabled) =>
        matrixRTCSession.updateCallIntent(videoEnabled ? "video" : "audio"),
      );

      return async (): Promise<void> => {
        intentScope.end();
        // Only sends Matrix leave event. The LiveKit session will disconnect
        // as soon as either the stopConnection$ handler above gets to it or
        // the view model is destroyed.
        try {
          await matrixRTCSession.leaveRoomSession();
        } catch (e) {
          logger.error("Error leaving RTC session", e);
        }
        try {
          await widget?.api.transport.send(ElementWidgetActions.HangupCall, {});
        } catch (e) {
          logger.error("Failed to send hangup action", e);
        }
      };
    }
  });

  /**
   * Returns undefined if scrennSharing is not yet ready.
   */
  const sharingScreen$ = scope.behavior(
    connection$.pipe(
      switchMap((c) => {
        if (!c) return of(undefined);
        if (c.state$.value.state === "ConnectedToLkRoom")
          return observeSharingScreen$(c.livekitRoom.localParticipant);
        return of(false);
      }),
    ),
    null,
  );

  const toggleScreenSharing =
    "getDisplayMedia" in (navigator.mediaDevices ?? {}) &&
    !getUrlParams().hideScreensharing
      ? (): void =>
          // If a connection is ready...
          void connection$
            .pipe(
              // I dont see why we need this. isnt the check later on superseeding it?
              takeWhile(
                (c) =>
                  c !== undefined && c.state$.value.state !== "FailedToStart",
              ),
              switchMap((c) =>
                c?.state$.value.state === "ConnectedToLkRoom" ? of(c) : NEVER,
              ),
              take(1),
              scope.bind(),
            )
            // ...toggle screen sharing.
            .subscribe(
              (c) =>
                void c.livekitRoom.localParticipant
                  .setScreenShareEnabled(!sharingScreen$.value, {
                    audio: true,
                    selfBrowserSurface: "include",
                    surfaceSwitching: "include",
                    systemAudio: "include",
                  })
                  .catch(logger.error),
            )
      : null;

  // we do not need all the auto waiting since we can just check via sharingScreen$.value !== undefined
  let alternativeScreenshareToggle: (() => void) | null = null;
  if (
    "getDisplayMedia" in (navigator.mediaDevices ?? {}) &&
    !getUrlParams().hideScreensharing
  ) {
    alternativeScreenshareToggle = (): void =>
      void connection$.value?.livekitRoom.localParticipant
        .setScreenShareEnabled(!sharingScreen$.value, {
          audio: true,
          selfBrowserSurface: "include",
          surfaceSwitching: "include",
          systemAudio: "include",
        })
        .catch(logger.error);
  }
  logger.log(
    "alternativeScreenshareToggle so that it is used",
    alternativeScreenshareToggle,
  );

  return {
    startTracks,
    requestConnect,
    requestDisconnect,
    connectionState: state,
    homeserverConnected$,
    connected$,
    reconnecting$,
    configError$,
    sharingScreen$,
    toggleScreenSharing,
  };
};
