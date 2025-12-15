/*
Copyright 2025 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LocalTrack,
  type Participant,
  ParticipantEvent,
  type LocalParticipant,
  type ScreenShareCaptureOptions,
} from "livekit-client";
import { observeParticipantEvents } from "@livekit/components-core";
import {
  Status as RTCSessionStatus,
  type LivekitTransport,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  from,
  map,
  type Observable,
  of,
  pairwise,
  startWith,
  switchMap,
  tap,
} from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { deepCompare } from "matrix-js-sdk/lib/utils";

import { constant, type Behavior } from "../../Behavior.ts";
import { type IConnectionManager } from "../remoteMembers/ConnectionManager.ts";
import { type ObservableScope } from "../../ObservableScope.ts";
import { type Publisher } from "./Publisher.ts";
import { type MuteStates } from "../../MuteStates.ts";
import {
  ElementCallError,
  FailToStartLivekitConnection,
  MembershipManagerError,
  UnknownCallError,
} from "../../../utils/errors.ts";
import { ElementWidgetActions, widget } from "../../../widget.ts";
import { getUrlParams } from "../../../UrlParams.ts";
import { PosthogAnalytics } from "../../../analytics/PosthogAnalytics.ts";
import { MatrixRTCMode } from "../../../settings/settings.ts";
import { Config } from "../../../config/Config.ts";
import {
  ConnectionState,
  type Connection,
  type FailedToStartError,
} from "../remoteMembers/Connection.ts";
import { type HomeserverConnected } from "./HomeserverConnected.ts";
import { and$ } from "../../../utils/observable.ts";

export enum TransportState {
  /** Not even a transport is available to the LocalMembership */
  Waiting = "transport_waiting",
}

export enum PublishState {
  WaitingForUser = "publish_waiting_for_user",
  /** Implies lk connection is connected */
  Starting = "publish_start_publishing",
  /** Implies lk connection is connected */
  Publishing = "publish_publishing",
}

export enum TrackState {
  /** The track is waiting for user input to create tracks (waiting to call `startTracks()`) */
  WaitingForUser = "tracks_waiting_for_user",
  /** Implies lk connection is connected */
  Creating = "tracks_creating",
  /** Implies lk connection is connected */
  Ready = "tracks_ready",
}

export type LocalMemberMediaState =
  | {
      tracks: TrackState;
      connection: ConnectionState | FailedToStartError;
    }
  | PublishState
  | ElementCallError;
export type LocalMemberState =
  | ElementCallError
  | TransportState.Waiting
  | {
      media: LocalMemberMediaState;
      matrix: ElementCallError | RTCSessionStatus;
    };

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
  // TODO add a comment into some code style readme or file header callviewmodel
  // that the inputs for those createSomething$() functions should NOT contain any js-sdk objectes
  scope: ObservableScope;
  muteStates: MuteStates;
  connectionManager: IConnectionManager;
  createPublisherFactory: (connection: Connection) => Publisher;
  joinMatrixRTC: (transport: LivekitTransport) => void;
  homeserverConnected: HomeserverConnected;
  localTransport$: Behavior<LivekitTransport | null>;
  matrixRTCSession: Pick<
    MatrixRTCSession,
    "updateCallIntent" | "leaveRoomSession"
  >;
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
  connectionManager,
  localTransport$: localTransportCanThrow$,
  homeserverConnected,
  createPublisherFactory,
  joinMatrixRTC,
  logger: parentLogger,
  muteStates,
  matrixRTCSession,
}: Props): {
  /**
   * This starts audio and video tracks. They will be reused when calling `requestPublish`.
   */
  startTracks: () => Behavior<LocalTrack[]>;
  /**
   * This sets a inner state (shouldPublish) to true and instructs the js-sdk and livekit to keep the user
   * connected to matrix and livekit.
   */
  requestJoinAndPublish: () => void;
  requestDisconnect: () => void;
  localMemberState$: Behavior<LocalMemberState>;
  sharingScreen$: Behavior<boolean>;
  /**
   * Callback to toggle screen sharing. If null, screen sharing is not possible.
   */
  toggleScreenSharing: (() => void) | null;
  tracks$: Behavior<LocalTrack[]>;
  participant$: Behavior<LocalParticipant | null>;
  connection$: Behavior<Connection | null>;
  /** Shorthand for homeserverConnected.rtcSession === Status.Reconnecting
   * Direct translation to the js-sdk membership manager connection `Status`.
   */
  reconnecting$: Behavior<boolean>;
  /** Shorthand for homeserverConnected.rtcSession === Status.Disconnected
   * Direct translation to the js-sdk membership manager connection `Status`.
   */
  disconnected$: Behavior<boolean>;
} => {
  const logger = parentLogger.getChild("[LocalMembership]");
  logger.debug(`Creating local membership..`);

  // Unwrap the local transport and set the state of the LocalMembership to error in case the transport is an error.
  const localTransport$ = scope.behavior(
    localTransportCanThrow$.pipe(
      catchError((e: unknown) => {
        let error: ElementCallError;
        if (e instanceof ElementCallError) {
          error = e;
        } else {
          error = new UnknownCallError(
            e instanceof Error
              ? e
              : new Error("Unknown error from localTransport"),
          );
        }
        setTransportError(error);
        return of(null);
      }),
    ),
  );

  // Drop Epoch data here since we will not combine this anymore
  const localConnection$ = scope.behavior(
    combineLatest([
      connectionManager.connectionManagerData$,
      localTransport$,
    ]).pipe(
      map(([{ value: connectionData }, localTransport]) => {
        if (localTransport === null) {
          return null;
        }

        return connectionData.getConnectionForTransport(localTransport);
      }),
      tap((connection) => {
        logger.info(
          `Local connection updated: ${connection?.transport?.livekit_service_url}`,
        );
      }),
    ),
  );

  // MATRIX RELATED

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const trackStartRequested = Promise.withResolvers<void>();

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const joinAndPublishRequested$ = new BehaviorSubject(false);

  /**
   * The publisher is stored in here an abstracts creating and publishing tracks.
   */
  const publisher$ = new BehaviorSubject<Publisher | null>(null);
  /**
   * Extract the tracks from the published. Also reacts to changing publishers.
   */
  const tracks$ = scope.behavior(
    publisher$.pipe(switchMap((p) => (p?.tracks$ ? p.tracks$ : constant([])))),
  );
  const publishing$ = scope.behavior(
    publisher$.pipe(switchMap((p) => p?.publishing$ ?? constant(false))),
  );

  const startTracks = (): Behavior<LocalTrack[]> => {
    trackStartRequested.resolve();
    return tracks$;
  };

  const requestJoinAndPublish = (): void => {
    trackStartRequested.resolve();
    joinAndPublishRequested$.next(true);
  };

  const requestDisconnect = (): void => {
    joinAndPublishRequested$.next(false);
  };

  // Take care of the publisher$
  // create a new one as soon as a local Connection is available
  //
  // Recreate a new one once the local connection changes
  //  - stop publishing
  //  - destruct all current streams
  //  - overwrite current publisher
  scope.reconcile(localConnection$, async (connection) => {
    if (connection !== null) {
      const publisher = createPublisherFactory(connection);
      publisher$.next(publisher);
      // Clean-up callback
      return Promise.resolve(async (): Promise<void> => {
        await publisher.stopPublishing();
        publisher.stopTracks();
      });
    }
  });

  // Use reconcile here to not run concurrent createAndSetupTracks calls
  // `tracks$` will update once they are ready.
  scope.reconcile(
    scope.behavior(
      combineLatest([publisher$, tracks$, from(trackStartRequested.promise)]),
      null,
    ),
    async (valueIfReady) => {
      if (!valueIfReady) return;
      const [publisher, tracks] = valueIfReady;
      if (publisher && tracks.length === 0) {
        await publisher.createAndSetupTracks().catch((e) => logger.error(e));
      }
    },
  );

  // Based on `connectRequested$` we start publishing tracks. (once they are there!)
  scope.reconcile(
    scope.behavior(
      combineLatest([publisher$, tracks$, joinAndPublishRequested$]),
    ),
    async ([publisher, tracks, shouldJoinAndPublish]) => {
      if (shouldJoinAndPublish === publisher?.publishing$.value) return;
      if (tracks.length !== 0 && shouldJoinAndPublish) {
        try {
          await publisher?.startPublishing();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          setPublishError(new FailToStartLivekitConnection(message));
        }
      } else if (tracks.length !== 0 && !shouldJoinAndPublish) {
        try {
          await publisher?.stopPublishing();
        } catch (error) {
          setPublishError(new UnknownCallError(error as Error));
        }
      }
    },
  );

  // STATE COMPUTATION

  // These are non fatal since we can join a room and concume media even though publishing failed.
  const publishError$ = new BehaviorSubject<ElementCallError | null>(null);
  const setPublishError = (e: ElementCallError): void => {
    if (publishError$.value !== null) {
      logger.error("Multiple Media Errors:", e);
    } else {
      publishError$.next(e);
    }
  };

  const fatalTransportError$ = new BehaviorSubject<ElementCallError | null>(
    null,
  );

  const setTransportError = (e: ElementCallError): void => {
    if (fatalTransportError$.value !== null) {
      logger.error("Multiple Transport Errors:", e);
    } else {
      fatalTransportError$.next(e);
    }
  };

  const localConnectionState$ = localConnection$.pipe(
    switchMap((connection) => (connection ? connection.state$ : of(null))),
  );

  const mediaState$: Behavior<LocalMemberMediaState> = scope.behavior(
    combineLatest([
      localConnectionState$,
      localTransport$,
      tracks$,
      publishing$,
      joinAndPublishRequested$,
      from(trackStartRequested.promise).pipe(
        map(() => true),
        startWith(false),
      ),
    ]).pipe(
      map(
        ([
          localConnectionState,
          localTransport,
          tracks,
          publishing,
          shouldPublish,
          shouldStartTracks,
        ]) => {
          if (!localTransport) return null;
          const hasTracks = tracks.length > 0;
          let trackState: TrackState = TrackState.WaitingForUser;
          if (hasTracks && shouldStartTracks) trackState = TrackState.Ready;
          if (!hasTracks && shouldStartTracks) trackState = TrackState.Creating;

          if (
            localConnectionState !== ConnectionState.LivekitConnected ||
            trackState !== TrackState.Ready
          )
            return {
              connection: localConnectionState,
              tracks: trackState,
            };
          if (!shouldPublish) return PublishState.WaitingForUser;
          if (!publishing) return PublishState.Starting;
          return PublishState.Publishing;
        },
      ),
      distinctUntilChanged(deepCompare),
    ),
  );
  const fatalMatrixError$ = new BehaviorSubject<ElementCallError | null>(null);
  const setMatrixError = (e: ElementCallError): void => {
    if (fatalMatrixError$.value !== null) {
      logger.error("Multiple Matrix Errors:", e);
    } else {
      fatalMatrixError$.next(e);
    }
  };

  const localMemberState$ = scope.behavior<LocalMemberState>(
    combineLatest([
      mediaState$,
      homeserverConnected.rtsSession$,
      fatalMatrixError$,
      fatalTransportError$,
      publishError$,
    ]).pipe(
      map(
        ([
          mediaState,
          rtcSessionStatus,
          fatalMatrixError,
          fatalTransportError,
          publishError,
        ]) => {
          if (fatalTransportError !== null) return fatalTransportError;
          // `mediaState` will be 'null' until the transport/connection appears.
          if (mediaState && rtcSessionStatus)
            return {
              matrix: fatalMatrixError ?? rtcSessionStatus,
              media: publishError ?? mediaState,
            };
          return TransportState.Waiting;
        },
      ),
    ),
  );

  /**
   * Whether we are "fully" connected to the call. Accounts for both the
   * connection to the MatrixRTC session and the LiveKit publish connection.
   */
  const matrixAndLivekitConnected$ = scope.behavior(
    and$(
      homeserverConnected.combined$,
      localConnectionState$.pipe(
        map((state) => state === ConnectionState.LivekitConnected),
      ),
    ).pipe(
      tap((v) => logger.debug("livekit+matrix: Connected state changed", v)),
    ),
  );

  /**
   * Whether we should tell the user that we're reconnecting to the call.
   */
  const reconnecting$ = scope.behavior(
    matrixAndLivekitConnected$.pipe(
      pairwise(),
      map(([prev, current]) => prev === true && current === false),
    ),
    false,
  );

  // inform the widget about the connect and disconnect intent from the user.
  scope
    .behavior(joinAndPublishRequested$.pipe(pairwise(), scope.bind()), [
      undefined,
      joinAndPublishRequested$.value,
    ])
    .subscribe(([prev, current]) => {
      if (!widget) return;
      // JOIN prev=false (was left) => current-true (now joiend)
      if (!prev && current) {
        widget.api.transport
          .send(ElementWidgetActions.JoinCall, {})
          .catch((e) => {
            logger.error("Failed to send join action", e);
          });
      }
      // LEAVE prev=false (was joined) => current-true (now left)
      if (prev && !current) {
        widget.api.transport
          .send(ElementWidgetActions.HangupCall, {})
          .catch((e) => {
            logger.error("Failed to send hangup action", e);
          });
      }
    });

  combineLatest([muteStates.video.enabled$, homeserverConnected.combined$])
    .pipe(scope.bind())
    .subscribe(([videoEnabled, connected]) => {
      if (!connected) return;
      void matrixRTCSession.updateCallIntent(videoEnabled ? "video" : "audio");
    });

  // Keep matrix rtc session in sync with localTransport$, connectRequested$
  scope.reconcile(
    scope.behavior(combineLatest([localTransport$, joinAndPublishRequested$])),
    async ([transport, shouldConnect]) => {
      if (!transport) return;
      // if shouldConnect=false we will do the disconnect as the cleanup from the previous reconcile iteration.
      if (!shouldConnect) return;

      try {
        joinMatrixRTC(transport);
      } catch (error) {
        logger.error("Error entering RTC session", error);
        if (error instanceof Error)
          setMatrixError(new MembershipManagerError(error));
      }

      return Promise.resolve(async (): Promise<void> => {
        try {
          // TODO Update matrixRTCSession to allow udpating the transport without leaving the session!
          await matrixRTCSession.leaveRoomSession(1000);
        } catch (e) {
          logger.error("Error leaving RTC session", e);
        }
      });
    },
  );

  const participant$ = scope.behavior(
    localConnection$.pipe(map((c) => c?.livekitRoom?.localParticipant ?? null)),
  );

  // Pause upstream of all local media tracks when we're disconnected from
  // MatrixRTC, because it can be an unpleasant surprise for the app to say
  // 'reconnecting' and yet still be transmitting your media to others.
  // We use matrixConnected$ rather than reconnecting$ because we want to
  // pause tracks during the initial joining sequence too until we're sure
  // that our own media is displayed on screen.
  // TODO refactor this based no livekitState$
  combineLatest([participant$, homeserverConnected.combined$])
    .pipe(scope.bind())
    .subscribe(([participant, connected]) => {
      if (!participant) return;
      const publications = participant.trackPublications.values();
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

  /**
   * Whether the user is currently sharing their screen.
   */
  const sharingScreen$ = scope.behavior(
    participant$.pipe(
      switchMap((p) => (p !== null ? observeSharingScreen$(p) : of(false))),
    ),
  );

  let toggleScreenSharing: (() => void) | null = null;
  if (
    "getDisplayMedia" in (navigator.mediaDevices ?? {}) &&
    !getUrlParams().hideScreensharing
  ) {
    toggleScreenSharing = (): void => {
      const screenshareSettings: ScreenShareCaptureOptions = {
        audio: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        systemAudio: "include",
      };
      const targetScreenshareState = !sharingScreen$.value;
      logger.info(
        `toggleScreenSharing called. Switching ${
          targetScreenshareState ? "On" : "Off"
        }`,
      );
      // If a connection is ready, toggle screen sharing.
      // We deliberately do nothing in the case of a null connection because
      // it looks nice for the call control buttons to all become available
      // at once upon joining the call, rather than introducing a disabled
      // state. The user can just click again.
      // We also allow screen sharing to be toggled even if the connection
      // is still initializing or publishing tracks, because there's no
      // technical reason to disallow this. LiveKit will publish if it can.
      participant$.value
        ?.setScreenShareEnabled(targetScreenshareState, screenshareSettings)
        .catch(logger.error);
    };
  }

  return {
    startTracks,
    requestJoinAndPublish,
    requestDisconnect,
    localMemberState$,
    tracks$,
    participant$,
    reconnecting$,
    disconnected$: scope.behavior(
      homeserverConnected.rtsSession$.pipe(
        map((state) => state === RTCSessionStatus.Disconnected),
      ),
    ),
    sharingScreen$,
    toggleScreenSharing,
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
 * Does the necessary steps to enter the RTC session on the matrix side:
 *  - Preparing the membership info (FOCUS to use, options)
 *  - Sends the matrix event to join the call, and starts the membership manager:
 *      - Delay events management
 *      - Handles retries (fails only after several attempts)
 *
 * @param rtcSession
 * @param transport
 * @param options
 * @throws If the widget could not send ElementWidgetActions.JoinCall action.
 */
// Exported for unit testing
export function enterRTCSession(
  rtcSession: MatrixRTCSession,
  transport: LivekitTransport,
  { encryptMedia, matrixRTCMode }: EnterRTCSessionOptions,
): void {
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
  // TODO where/how do we track errors originating from the ongoing rtcSession?
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
}
