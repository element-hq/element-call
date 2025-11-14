/*
Copyright 2025 New Vector Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LocalTrack,
  type Participant,
  ParticipantEvent,
  type LocalParticipant,
} from "livekit-client";
import { observeParticipantEvents } from "@livekit/components-core";
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
  type Observable,
  of,
  scan,
  startWith,
  switchMap,
  tap,
} from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../../Behavior";
import { type IConnectionManager } from "../remoteMembers/ConnectionManager";
import { ObservableScope } from "../../ObservableScope";
import { Publisher } from "./Publisher";
import { type MuteStates } from "../../MuteStates";
import { type ProcessorState } from "../../../livekit/TrackProcessorContext";
import { type MediaDevices } from "../../MediaDevices";
import { and$ } from "../../../utils/observable";
import { type ElementCallError } from "../../../utils/errors";
import {
  ElementWidgetActions,
  widget,
  type WidgetHelpers,
} from "../../../widget";
import { areLivekitTransportsEqual } from "../remoteMembers/MatrixLivekitMembers";
import { getUrlParams } from "../../../UrlParams.ts";
import { PosthogAnalytics } from "../../../analytics/PosthogAnalytics.ts";
import { MatrixRTCMode } from "../../../settings/settings.ts";
import { Config } from "../../../config/Config.ts";
import { type Connection } from "../remoteMembers/Connection.ts";

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
  livekit$: Behavior<LocalMemberLivekitState>;
  matrix$: Behavior<LocalMemberMatrixState>;
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
  localTransport$: Behavior<LivekitTransport | null>;
  trackProcessorState$: Behavior<ProcessorState>;
  widget: WidgetHelpers | null;
  logger: Logger;
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
  trackProcessorState$,
  widget,
  logger: parentLogger,
}: Props): {
  // publisher: Publisher
  requestConnect: () => LocalMemberConnectionState;
  startTracks: () => Behavior<LocalTrack[]>;
  requestDisconnect: () => Observable<LocalMemberLivekitState> | null;
  connectionState: LocalMemberConnectionState;
  sharingScreen$: Behavior<boolean>;
  /**
   * Callback to toggle screen sharing. If null, screen sharing is not possible.
   */
  toggleScreenSharing: (() => void) | null;
  participant$: Behavior<LocalParticipant | null>;
  connection$: Behavior<Connection | null>;
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
  const logger = parentLogger.getChild("[LocalMembership]");
  logger.debug(`Creating local membership..`);
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
  const trackStartRequested$ = new BehaviorSubject(false);

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const connectRequested$ = new BehaviorSubject(false);

  // This should be used in a combineLatest with publisher$ to connect.
  const tracks$ = new BehaviorSubject<LocalTrack[]>([]);

  // Drop Epoch data here since we will not combine this anymore
  const localConnection$ = scope.behavior(
    combineLatest([connectionManager.connections$, localTransport$]).pipe(
      map(([connections, localTransport]) => {
        if (localTransport === null) {
          return null;
        }
        return (
          connections.value.find((connection) =>
            areLivekitTransportsEqual(connection.transport, localTransport),
          ) ?? null
        );
      }),
      tap((connection) => {
        logger.info(
          `Local connection updated: ${connection?.transport?.livekit_service_url}`,
        );
      }),
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
    ).pipe(
      tap((connected) => {
        logger.info(`Homeserver connected update: ${connected}`);
      }),
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
      localConnection$.pipe(
        switchMap((c) =>
          c
            ? c.state$.pipe(map((state) => state.state === "ConnectedToLkRoom"))
            : of(false),
        ),
      ),
    ),
  );

  const publisher$ = new BehaviorSubject<Publisher | null>(null);
  localConnection$.subscribe((connection) => {
    if (connection !== null && publisher$.value === null) {
      // TODO looks strange to not change publisher if connection changes.
      publisher$.next(
        new Publisher(
          scope,
          connection,
          mediaDevices,
          muteStates,
          trackProcessorState$,
        ),
      );
    }
  });

  combineLatest([publisher$, trackStartRequested$]).subscribe(
    ([publisher, shouldStartTracks]) => {
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
    trackStartRequested$.next(true);
    return tracks$;
  };

  combineLatest([publisher$, tracks$]).subscribe(([publisher, tracks]) => {
    if (
      tracks.length === 0 ||
      // change this to !== Publishing
      state.livekit$.value.state !== LivekitState.Uninitialized
    ) {
      return;
    }
    state.livekit$.next({ state: LivekitState.Connecting });
    publisher
      ?.startPublishing()
      .then(() => {
        state.livekit$.next({ state: LivekitState.Connected });
      })
      .catch((error) => {
        state.livekit$.next({ state: LivekitState.Error, error });
      });
  });

  combineLatest([localTransport$, connectRequested$]).subscribe(
    ([transport, connectRequested]) => {
      if (
        transport === null ||
        !connectRequested ||
        state.matrix$.value.state !== MatrixState.Disconnected
      ) {
        logger.info(
          "Not yet connecting because: ",
          "transport === null:",
          transport === null,
          "!connectRequested:",
          !connectRequested,
          "state.matrix$.value.state !== MatrixState.Disconnected:",
          state.matrix$.value.state !== MatrixState.Disconnected,
        );
        return;
      }
      state.matrix$.next({ state: MatrixState.Connecting });
      logger.info("Matrix State connecting");
      enterRTCSession(matrixRTCSession, transport, options.value).catch(
        (error) => {
          logger.error(error);
        },
      );
    },
  );

  const requestConnect = (): LocalMemberConnectionState => {
    trackStartRequested$.next(true);
    connectRequested$.next(true);

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
  combineLatest([localConnection$, homeserverConnected$])
    .pipe(scope.bind())
    .subscribe(([connection, connected]) => {
      if (connection?.state$.value.state !== "ConnectedToLkRoom") return;
      const publications =
        connection.livekitRoom.localParticipant.trackPublications.values();
      if (connected) {
        for (const p of publications) {
          if (p.track?.isUpstreamPaused === true) {
            const kind = p.track.kind;
            logger.info(
              `Resuming ${kind} track (MatrixRTC connection present)`,
            );
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
            logger.info(
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
   * Whether the user is currently sharing their screen.
   */
  const sharingScreen$ = scope.behavior(
    localConnection$.pipe(
      switchMap((c) =>
        c === null
          ? of(false)
          : observeSharingScreen$(c.livekitRoom.localParticipant),
      ),
    ),
  );

  const toggleScreenSharing =
    "getDisplayMedia" in (navigator.mediaDevices ?? {}) &&
    !getUrlParams().hideScreensharing
      ? (): void =>
          // If a connection is ready, toggle screen sharing.
          // We deliberately do nothing in the case of a null connection because
          // it looks nice for the call control buttons to all become available
          // at once upon joining the call, rather than introducing a disabled
          // state. The user can just click again.
          // We also allow screen sharing to be toggled even if the connection
          // is still initializing or publishing tracks, because there's no
          // technical reason to disallow this. LiveKit will publish if it can.
          void localConnection$.value?.livekitRoom.localParticipant
            .setScreenShareEnabled(!sharingScreen$.value, {
              audio: true,
              selfBrowserSurface: "include",
              surfaceSwitching: "include",
              systemAudio: "include",
            })
            .catch(logger.error)
      : null;

  const participant$ = scope.behavior(
    localConnection$.pipe(map((c) => c?.livekitRoom.localParticipant ?? null)),
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
    participant$,
    connection$: localConnection$,
  };
};

export function observeSharingScreen$(p: Participant): Observable<boolean> {
  return observeParticipantEvents(
    p,
    ParticipantEvent.TrackPublished,
    ParticipantEvent.TrackUnpublished,
    ParticipantEvent.LocalTrackPublished,
    ParticipantEvent.LocalTrackUnpublished,
  ).pipe(map((p) => p.isScreenShareEnabled));
}

interface EnterRTCSessionOptions {
  encryptMedia: boolean;
  matrixRTCMode: MatrixRTCMode;
}

/**
 * TODO! document this function properly
 * @param rtcSession
 * @param transport
 * @param options
 * @throws If the widget could not send ElementWidgetActions.JoinCall action.
 */
// Exported for unit testing
export async function enterRTCSession(
  rtcSession: MatrixRTCSession,
  transport: LivekitTransport,
  { encryptMedia, matrixRTCMode }: EnterRTCSessionOptions,
): Promise<void> {
  PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
  PosthogAnalytics.instance.eventCallStarted.track(rtcSession.room.roomId);

  // This must be called before we start trying to join the call, as we need to
  // have started tracking by the time calls start getting created.
  // groupCallOTelMembership?.onJoinCall();

  const { features, matrix_rtc_session: matrixRtcSessionConfig } = Config.get();
  const useDeviceSessionMemberEvents =
    features?.feature_use_device_session_member_events;
  const { sendNotificationType: notificationType, callIntent } = getUrlParams();
  const multiSFU = matrixRTCMode !== MatrixRTCMode.Legacy;
  // Multi-sfu does not need a preferred foci list. just the focus that is actually used.
  rtcSession.joinRoomSession(
    multiSFU ? [] : [transport],
    multiSFU ? transport : undefined,
    {
      notificationType,
      callIntent,
      manageMediaKeys: encryptMedia,
      ...(useDeviceSessionMemberEvents !== undefined && {
        useLegacyMemberEvents: !useDeviceSessionMemberEvents,
      }),
      delayedLeaveEventRestartMs:
        matrixRtcSessionConfig?.delayed_leave_event_restart_ms,
      delayedLeaveEventDelayMs:
        matrixRtcSessionConfig?.delayed_leave_event_delay_ms,
      delayedLeaveEventRestartLocalTimeoutMs:
        matrixRtcSessionConfig?.delayed_leave_event_restart_local_timeout_ms,
      networkErrorRetryMs: matrixRtcSessionConfig?.network_error_retry_ms,
      makeKeyDelay: matrixRtcSessionConfig?.wait_for_key_rotation_ms,
      membershipEventExpiryMs:
        matrixRtcSessionConfig?.membership_event_expiry_ms,
      useExperimentalToDeviceTransport: true,
      unstableSendStickyEvents: matrixRTCMode === MatrixRTCMode.Matrix_2_0,
    },
  );
  if (widget) {
    await widget.api.transport.send(ElementWidgetActions.JoinCall, {});
  }
}
