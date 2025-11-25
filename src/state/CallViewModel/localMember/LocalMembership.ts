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
  type LivekitTransport,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  of,
  scan,
  switchMap,
  tap,
} from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { deepCompare } from "matrix-js-sdk/lib/utils";

import { constant, type Behavior } from "../../Behavior";
import { type IConnectionManager } from "../remoteMembers/ConnectionManager";
import { ObservableScope } from "../../ObservableScope";
import { type Publisher } from "./Publisher";
import { type MuteStates } from "../../MuteStates";
import { and$ } from "../../../utils/observable";
import {
  ElementCallError,
  MembershipManagerError,
  UnknownCallError,
} from "../../../utils/errors";
import { ElementWidgetActions, widget } from "../../../widget";
import { getUrlParams } from "../../../UrlParams.ts";
import { PosthogAnalytics } from "../../../analytics/PosthogAnalytics.ts";
import { MatrixRTCMode } from "../../../settings/settings.ts";
import { Config } from "../../../config/Config.ts";
import { type Connection } from "../remoteMembers/Connection.ts";

export enum LivekitState {
  Error = "error",
  /** Not even a transport is available to the LocalMembership */
  WaitingForTransport = "waiting_for_transport",
  /** A transport is and we are loading the connection based on the transport */
  Connecting = "connecting",
  InitialisingPublisher = "uninitialized",
  Initialized = "Initialized",
  CreatingTracks = "creating_tracks",
  ReadyToPublish = "ready_to_publish",
  WaitingToPublish = "publishing",
  Connected = "connected",
  Disconnected = "disconnected",
  Disconnecting = "disconnecting",
}

type LocalMemberLivekitState =
  | { state: LivekitState.Error; error: ElementCallError }
  | { state: LivekitState.WaitingForTransport }
  | { state: LivekitState.Connecting }
  | { state: LivekitState.InitialisingPublisher }
  | { state: LivekitState.Initialized }
  | { state: LivekitState.CreatingTracks }
  | { state: LivekitState.ReadyToPublish }
  | { state: LivekitState.WaitingToPublish }
  | { state: LivekitState.Connected }
  | { state: LivekitState.Disconnected }
  | { state: LivekitState.Disconnecting };

export enum MatrixState {
  WaitingForTransport = "waiting_for_transport",
  Ready = "ready",
  Connecting = "connecting",
  Connected = "connected",
  Disconnected = "disconnected",
  Error = "Error",
}

type LocalMemberMatrixState =
  | { state: MatrixState.Connected }
  | { state: MatrixState.WaitingForTransport }
  | { state: MatrixState.Ready }
  | { state: MatrixState.Connecting }
  | { state: MatrixState.Disconnected }
  | { state: MatrixState.Error; error: Error };

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
  // TODO add a comment into some code style readme or file header callviewmodel
  // that the inputs for those createSomething$() functions should NOT contain any js-sdk objectes
  scope: ObservableScope;
  muteStates: MuteStates;
  connectionManager: IConnectionManager;
  createPublisherFactory: (connection: Connection) => Publisher;
  joinMatrixRTC: (transport: LivekitTransport) => Promise<void>;
  homeserverConnected$: Behavior<boolean>;
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
  homeserverConnected$,
  createPublisherFactory,
  joinMatrixRTC,
  logger: parentLogger,
  muteStates,
  matrixRTCSession,
}: Props): {
  requestConnect: () => void;
  startTracks: () => Behavior<LocalTrack[]>;
  requestDisconnect: () => void;
  connectionState: LocalMemberConnectionState;
  sharingScreen$: Behavior<boolean>;
  /**
   * Callback to toggle screen sharing. If null, screen sharing is not possible.
   */
  toggleScreenSharing: (() => void) | null;
  participant$: Behavior<LocalParticipant | null>;
  connection$: Behavior<Connection | null>;
  homeserverConnected$: Behavior<boolean>;
  // deprecated fields
  /** @deprecated use state instead*/
  connected$: Behavior<boolean>;
  // this needs to be discussed
  /** @deprecated use state instead*/
  reconnecting$: Behavior<boolean>;
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
        setLivekitError(error);
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

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const trackStartRequested$ = new BehaviorSubject(false);

  // This should be used in a combineLatest with publisher$ to connect.
  // to make it possible to call startTracks before the preferredTransport$ has resolved.
  const connectRequested$ = new BehaviorSubject(false);

  /**
   * The publisher is stored in here an abstracts creating and publishing tracks.
   */
  const publisher$ = new BehaviorSubject<Publisher | null>(null);
  /**
   * Extract the tracks from the published. Also reacts to changing publishers.
   */
  const tracks$ = scope.behavior(
    publisher$.pipe(switchMap((p) => (p ? p.tracks$ : constant([])))),
  );
  const publishing$ = scope.behavior(
    publisher$.pipe(switchMap((p) => (p ? p.publishing$ : constant(false)))),
  );

  const startTracks = (): Behavior<LocalTrack[]> => {
    trackStartRequested$.next(true);
    return tracks$;
  };

  const requestConnect = (): void => {
    trackStartRequested$.next(true);
    connectRequested$.next(true);
  };

  const requestDisconnect = (): void => {
    connectRequested$.next(false);
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
      publisher$.next(createPublisherFactory(connection));
    }
    return Promise.resolve(async (): Promise<void> => {
      await publisher$?.value?.stopPublishing();
      publisher$?.value?.stopTracks();
    });
  });

  // const mutestate= publisher$.pipe(switchMap((publisher) => {
  //   return publisher.muteState$
  // });

  // For each publisher create the descired tracks
  // If we recreate a new publisher we remember the trackStartRequested$ value and immediately create the tracks
  // THIS might be fine without a reconcile. There is no cleanup needed. We always get a working publisher
  // track start request can than just toggle the tracks.
  // TODO does this need `reconcile` to make sure we wait for createAndSetupTracks before we stop tracks?
  combineLatest([publisher$, trackStartRequested$]).subscribe(
    ([publisher, shouldStartTracks]) => {
      if (publisher && shouldStartTracks) {
        publisher.createAndSetupTracks().catch(
          // TODO make this set some error state
          (e) => logger.error(e),
        );
      } else if (publisher) {
        publisher.stopTracks();
      }
    },
  );

  // Use reconcile here to not run concurrent createAndSetupTracks calls
  // `tracks$` will update once they are ready.
  scope.reconcile(
    scope.behavior(combineLatest([publisher$, trackStartRequested$])),
    async ([publisher, shouldStartTracks]) => {
      if (publisher && shouldStartTracks) {
        await publisher.createAndSetupTracks().catch((e) => logger.error(e));
      } else if (publisher) {
        publisher.stopTracks();
      }
    },
  );

  // Based on `connectRequested$` we start publishing tracks. (once they are there!)
  scope.reconcile(
    scope.behavior(combineLatest([publisher$, tracks$, connectRequested$])),
    async ([publisher, tracks, shouldConnect]) => {
      if (shouldConnect === publisher?.publishing$.value)
        return Promise.resolve();
      if (tracks.length !== 0 && shouldConnect) {
        try {
          await publisher?.startPublishing();
        } catch (error) {
          // will take care of "FailedToStartLk" errors.
          setLivekitError(error as ElementCallError);
        }
      } else if (tracks.length !== 0 && !shouldConnect) {
        try {
          await publisher?.stopPublishing();
        } catch (error) {
          setLivekitError(new UnknownCallError(error as Error));
        }
      }
    },
  );

  const fatalLivekitError$ = new BehaviorSubject<ElementCallError | null>(null);
  const setLivekitError = (e: ElementCallError): void => {
    if (fatalLivekitError$.value !== null)
      logger.error("Multiple Livkit Errors:", e);
    else fatalLivekitError$.next(e);
  };
  const livekitState$: Observable<LocalMemberLivekitState> = combineLatest([
    publisher$,
    localTransport$,
    localConnection$,
    tracks$,
    publishing$,
    connectRequested$,
    trackStartRequested$,
    fatalLivekitError$,
  ]).pipe(
    map(
      ([
        publisher,
        localTransport,
        localConnection,
        tracks,
        publishing,
        shouldConnect,
        shouldStartTracks,
        error,
      ]) => {
        // read this:
        // if(!<A>) return {state: ...}
        // if(!<B>) return {state: <MyState>}
        //
        // as:
        // We do have <A> but not yet <B> so we are in <MyState>
        if (error !== null) return { state: LivekitState.Error, error };
        const hasTracks = tracks.length > 0;
        if (!localTransport) return { state: LivekitState.WaitingForTransport };
        if (!localConnection) return { state: LivekitState.Connecting };
        if (!publisher) return { state: LivekitState.InitialisingPublisher };
        if (!shouldStartTracks) return { state: LivekitState.Initialized };
        if (!hasTracks) return { state: LivekitState.CreatingTracks };
        if (!shouldConnect) return { state: LivekitState.ReadyToPublish };
        if (!publishing) return { state: LivekitState.WaitingToPublish };
        return { state: LivekitState.Connected };
      },
    ),
    distinctUntilChanged(deepCompare),
  );

  const fatalMatrixError$ = new BehaviorSubject<ElementCallError | null>(null);
  const setMatrixError = (e: ElementCallError): void => {
    if (fatalMatrixError$.value !== null)
      logger.error("Multiple Matrix Errors:", e);
    else fatalMatrixError$.next(e);
  };
  const matrixState$: Behavior<LocalMemberMatrixState> = scope.behavior(
    combineLatest([
      localTransport$,
      connectRequested$,
      homeserverConnected$,
    ]).pipe(
      map(([localTransport, connectRequested, homeserverConnected]) => {
        if (!localTransport) return { state: MatrixState.WaitingForTransport };
        if (!connectRequested) return { state: MatrixState.Ready };
        if (!homeserverConnected) return { state: MatrixState.Connecting };
        return { state: MatrixState.Connected };
      }),
    ),
  );

  // Keep matrix rtc session in sync with localTransport$, connectRequested$ and muteStates.video.enabled$
  scope.reconcile(
    scope.behavior(combineLatest([localTransport$, connectRequested$])),
    async ([transport, shouldConnect]) => {
      if (!shouldConnect) return;

      if (!transport) return;
      try {
        await joinMatrixRTC(transport);
      } catch (error) {
        logger.error("Error entering RTC session", error);
        if (error instanceof Error)
          setMatrixError(new MembershipManagerError(error));
      }

      // Update our member event when our mute state changes.
      const callIntentScope = new ObservableScope();
      // because this uses its own scope, we can start another reconciliation for the duration of one connection.
      callIntentScope.reconcile(
        muteStates.video.enabled$,
        async (videoEnabled) =>
          matrixRTCSession.updateCallIntent(videoEnabled ? "video" : "audio"),
      );

      return async (): Promise<void> => {
        callIntentScope.end();
        try {
          // Update matrixRTCSession to allow udpating the transport without leaving the session!
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
  combineLatest([participant$, homeserverConnected$])
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

  let toggleScreenSharing = null;
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
    requestConnect,
    requestDisconnect,
    connectionState: {
      livekit$: scope.behavior(livekitState$),
      matrix$: matrixState$,
    },
    homeserverConnected$,
    connected$,
    reconnecting$,
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
  if (widget) {
    await widget.api.transport.send(ElementWidgetActions.JoinCall, {});
  }
}
