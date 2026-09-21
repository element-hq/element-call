/*
Copyright 2026 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LocalParticipant,
  MediaDeviceFailure,
  type Participant,
  ParticipantEvent,
  RoomEvent,
  type ScreenShareCaptureOptions,
  type TrackPublishOptions,
} from "livekit-client";
import { observeParticipantEvents } from "@livekit/components-core";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  from,
  fromEvent,
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

import { type Behavior } from "../../Behavior.ts";
import { type ObservableScope } from "../../ObservableScope.ts";
import { type Publisher } from "./Publisher.ts";
import {
  type ElementCallError,
  FailToStartLivekitConnection,
  UnknownCallError,
} from "../../../utils/errors.ts";
import { type HostBridge } from "../../../HostBridge.ts";
import {
  advancedScreenShare,
  screenShareResolution,
  screenShareFramerate,
  screenShareBitrate,
  screenShareCodec,
  parseResolution,
} from "../../../settings/settings.ts";
import { Config } from "../../../config/Config.ts";
import {
  ConnectionState,
  type Connection,
  type FailedToStartError,
} from "../remoteMembers/Connection.ts";

export enum PublishState {
  WaitingForUser = "publish_waiting_for_user",
  // XXX: This state is removed for now since we do not have full control over
  // track publication anymore with the publisher abstraction, might come back in the future?
  // /** Implies lk connection is connected */
  // Starting = "publish_start_publishing",
  /** Implies lk connection is connected */
  Publishing = "publish_publishing",
}

// TODO not sure how to map that correctly with the
// new publisher that does not manage tracks itself anymore
export enum TrackState {
  /** The track is waiting for user input to create tracks (waiting to call `startTracks()`) */
  WaitingForUser = "tracks_waiting_for_user",
  // XXX: This state is removed for now since we do not have full control over
  // track creation anymore with the publisher abstraction, might come back in the future?
  // /** Implies lk connection is connected */
  // Creating = "tracks_creating",
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

export interface LocalMediaProps {
  scope: ObservableScope;
  /** The connection we publish our media on, once there is one. */
  localConnection$: Behavior<Connection | null>;
  /**
   * Whether the transport we publish on is known. Until it is, there is no
   * media state to speak of (`mediaState$` is null).
   */
  transportReady$: Behavior<boolean>;
  /**
   * Whether the Matrix side of the call is connected. Upstream media is paused
   * while it is not, so that "reconnecting" never means "still transmitting".
   */
  matrixConnected$: Observable<boolean>;
  createPublisherFactory: (connection: Connection) => Publisher;
  /** Whether to hide the screen-sharing button. */
  hideScreensharing: boolean;
  /** The application hosting Element Call, to be kept informed of join/leave. */
  hostBridge: HostBridge;
  logger: Logger;
}

export interface LocalMedia {
  /**
   * This request to start audio and video tracks.
   * Can be called early to pre-emptively get media permissions and start devices.
   */
  startTracks: () => void;
  /**
   * This sets a inner state (shouldPublish) to true and instructs the Matrix
   * side and livekit to keep the user connected.
   */
  requestJoinAndPublish: () => void;
  requestDisconnect: () => void;
  /** What the user last asked for: to be in the call, or out of it. */
  joinAndPublishRequested$: Behavior<boolean>;
  participant$: Behavior<LocalParticipant | null>;
  /** The state of the connection we publish on; null without one. */
  localConnectionState$: Observable<ConnectionState | Error | null>;
  /** Null until the transport is known. */
  mediaState$: Behavior<LocalMemberMediaState | null>;
  /** A non-fatal failure to publish; we can still consume media. */
  publishError$: Behavior<ElementCallError | null>;
  sharingScreen$: Behavior<boolean>;
  /**
   * Callback to toggle screen sharing. If null, screen sharing is not possible.
   */
  toggleScreenSharing: (() => void) | null;
  /**
   * The last error from toggling screen sharing, until dismissed.
   */
  screenShareError$: Behavior<Error | null>;
  dismissScreenShareError: () => void;
}

/**
 * The LiveKit half of our own membership, shared by every Matrix side there
 * is: creating a publisher on the local connection, starting tracks and
 * publishing them when asked, screen sharing, pausing upstream media while
 * Matrix is away, and telling the host when the user joins or hangs up.
 */
export function createLocalMedia$({
  scope,
  localConnection$,
  transportReady$,
  matrixConnected$,
  createPublisherFactory,
  hideScreensharing,
  hostBridge,
  logger,
}: LocalMediaProps): LocalMedia {
  // Tracks error that happen when creating the local tracks.
  const mediaErrors$ = localConnection$.pipe(
    switchMap((connection) => {
      if (!connection) {
        return of(null);
      } else {
        return fromEvent(
          connection.livekitRoom,
          RoomEvent.MediaDevicesError,
          (error: Error) => {
            return MediaDeviceFailure.getFailure(error) ?? null;
          },
        );
      }
    }),
  );

  mediaErrors$.pipe(scope.bind()).subscribe((error) => {
    if (error) {
      // This is a MediaDevice error, can be PermissionDenied, NotFound, DeviceInUse, Other.
      // Will also occurs if you cancel screen sharing browser prompt.
      // This is not necessarily fatal, since the user might be able to join without media.
      // XXX We might want to give some user feedback here to let them know their media is not working.
      logger.error(`Failed to create local tracks:`, error);
    }
  });

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

  const startTracks = (): void => {
    trackStartRequested.resolve();
    // This used to return the tracks, but now they are only accessible via the publisher.
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
    logger.info(
      "reconcile based on new localConnection:",
      connection?.transport.livekit_service_url,
    );
    if (connection !== null) {
      const publisher = createPublisherFactory(connection);
      publisher$.next(publisher);

      // Clean-up callback
      return Promise.resolve(async (): Promise<void> => {
        await publisher.destroy();
      });
    }
  });

  // Use reconcile here to not run concurrent createAndSetupTracks calls
  // `tracks$` will update once they are ready.
  scope.reconcile(
    scope.behavior(
      combineLatest([
        publisher$ /*, tracks$*/,
        from(trackStartRequested.promise),
      ]),
      null,
    ),
    async (valueIfReady) => {
      if (!valueIfReady) return;
      const [publisher] = valueIfReady;
      if (publisher) {
        await publisher.createAndSetupTracks().catch((e) => logger.error(e));
      }
    },
  );

  // These are non fatal since we can join a room and concume media even though publishing failed.
  const publishError$ = new BehaviorSubject<ElementCallError | null>(null);
  const setPublishError = (e: ElementCallError): void => {
    if (publishError$.value !== null) {
      logger.error("Multiple Media Errors:", e);
    } else {
      publishError$.next(e);
    }
  };

  // Based on `connectRequested$` we start publishing tracks. (once they are there!)
  scope.reconcile(
    scope.behavior(combineLatest([publisher$, joinAndPublishRequested$])),
    async ([publisher, shouldJoinAndPublish]) => {
      // Get the current publishing state to avoid redundant calls.
      const isPublishing = publisher?.shouldPublish === true;
      if (shouldJoinAndPublish && !isPublishing) {
        try {
          await publisher?.startPublishing();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          setPublishError(new FailToStartLivekitConnection(message));
        }
      } else if (isPublishing) {
        try {
          await publisher?.stopPublishing();
        } catch (error) {
          setPublishError(new UnknownCallError(error as Error));
        }
      }
    },
  );

  const localConnectionState$ = localConnection$.pipe(
    switchMap((connection) => (connection ? connection.state$ : of(null))),
  );

  const mediaState$: Behavior<LocalMemberMediaState | null> = scope.behavior(
    combineLatest([
      localConnectionState$,
      transportReady$,
      joinAndPublishRequested$,
      from(trackStartRequested.promise).pipe(
        map(() => true),
        startWith(false),
      ),
    ]).pipe(
      map(
        ([
          localConnectionState,
          transportReady,
          shouldPublish,
          shouldStartTracks,
        ]) => {
          if (!transportReady) return null;
          const trackState: TrackState = shouldStartTracks
            ? TrackState.Ready
            : TrackState.WaitingForUser;

          if (
            localConnectionState !== ConnectionState.LivekitConnected ||
            trackState !== TrackState.Ready
          )
            return {
              connection: localConnectionState,
              tracks: trackState,
            };
          if (!shouldPublish) return PublishState.WaitingForUser;
          // if (!publishing) return PublishState.Starting;
          return PublishState.Publishing;
        },
      ),
      distinctUntilChanged(deepCompare),
    ),
  );

  // inform the host about the connect and disconnect intent from the user.
  scope
    .behavior(joinAndPublishRequested$.pipe(pairwise(), scope.bind()), [
      undefined,
      joinAndPublishRequested$.value,
    ])
    .subscribe(([prev, current]) => {
      // JOIN prev=false (was left) => current-true (now joiend)
      if (!prev && current) {
        hostBridge.notifyJoined().catch((e) => {
          logger.error("Failed to notify the host that we joined", e);
        });
      }
      // LEAVE prev=false (was joined) => current-true (now left)
      if (prev && !current) {
        hostBridge.notifyHungUp().catch((e) => {
          logger.error("Failed to notify the host that we hung up", e);
        });
      }
    });

  const participant$ = scope.behavior(
    localConnection$.pipe(
      map((c) => c?.livekitRoom?.localParticipant ?? null),
      tap((p) => {
        logger.debug("participant$ updated:", p?.identity);
      }),
    ),
  );

  // Pause upstream of all local media tracks when we're disconnected from
  // MatrixRTC, because it can be an unpleasant surprise for the app to say
  // 'reconnecting' and yet still be transmitting your media to others.
  // We use matrixConnected$ rather than reconnecting$ because we want to
  // pause tracks during the initial joining sequence too until we're sure
  // that our own media is displayed on screen.
  // TODO refactor this based no livekitState$
  combineLatest([participant$, matrixConnected$])
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

  const screenShareError$ = new BehaviorSubject<Error | null>(null);
  let toggleScreenSharing: (() => void) | null = null;
  if (
    "getDisplayMedia" in (navigator.mediaDevices ?? {}) &&
    !hideScreensharing
  ) {
    toggleScreenSharing = (): void => {
      const screenshareSettings: ScreenShareCaptureOptions = {
        // Screen share audio shouldn't have any filtering.
        // "echoCancellation" is purposely excluded, as setting it to
        // false causes the screen share audio track to include
        // an echo of the incoming participant's voice
        audio: {
          autoGainControl: false,
          noiseSuppression: false,
          voiceIsolation: false,
        },
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        systemAudio: "include",
      };

      let publishOptions: TrackPublishOptions | undefined;

      if (advancedScreenShare.getValue()) {
        // User has advanced screen share settings enabled
        const { width, height } = parseResolution(
          screenShareResolution.getValue(),
        );
        const fps = screenShareFramerate.getValue();
        const bps = screenShareBitrate.getValue();
        const codec = screenShareCodec.getValue();

        screenshareSettings.resolution = {
          width,
          height,
          frameRate: fps,
        };

        publishOptions = {
          screenShareEncoding: {
            maxBitrate: bps,
            maxFramerate: fps,
          },
          videoCodec: codec,
        };
      } else {
        // Fall back to config.json settings if available
        const screenConf = Config.get().media_quality?.screen_share;
        if (screenConf?.max_resolution) {
          screenshareSettings.resolution = {
            width: Math.round((screenConf.max_resolution * 16) / 9),
            height: screenConf.max_resolution,
            frameRate: screenConf.max_framerate ?? 30,
          };
        }
      }

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
      const participant = participant$.value;
      if (!participant) return;
      watchScreenShareToggle(
        participant.setScreenShareEnabled(
          targetScreenshareState,
          screenshareSettings,
          publishOptions,
        ),
        targetScreenshareState,
        logger,
        (e) => screenShareError$.next(e),
      );
    };
  }

  return {
    startTracks,
    requestJoinAndPublish,
    requestDisconnect,
    joinAndPublishRequested$,
    participant$,
    localConnectionState$,
    mediaState$,
    publishError$,
    sharingScreen$,
    toggleScreenSharing,
    screenShareError$,
    dismissScreenShareError: () => screenShareError$.next(null),
  };
}

/**
 * Logs the outcome of a screen share toggle and reports failures.
 *
 * getDisplayMedia may legitimately take a long time (the user is choosing
 * what to share) or never settle at all, so nothing is inferred from silence:
 * the request and its completion are logged with the elapsed time so that a
 * hang is visible in the logs, and only an explicit rejection is reported.
 *
 * The user cancelling the picker rejects with a NotAllowedError; that is
 * logged but not reported.
 */
export function watchScreenShareToggle(
  toggle: Promise<unknown>,
  enable: boolean,
  logger: Logger,
  onError: (e: Error) => void,
): void {
  const what = `Screen share ${enable ? "start" : "stop"}`;
  const started = Date.now();
  const elapsed = (): string => `${Date.now() - started} ms`;
  logger.info(`${what} requested`);
  toggle.then(
    () => logger.info(`${what} completed in ${elapsed()}`),
    (e: unknown) => {
      logger.error(`${what} failed after ${elapsed()}:`, e);
      if (e instanceof DOMException && e.name === "NotAllowedError") return;
      onError(e instanceof Error ? e : new Error(String(e)));
    },
  );
}

export function observeSharingScreen$(p: Participant): Observable<boolean> {
  return observeParticipantEvents(
    p,
    ParticipantEvent.TrackPublished,
    ParticipantEvent.TrackUnpublished,
    ParticipantEvent.LocalTrackPublished,
    ParticipantEvent.LocalTrackUnpublished,
  ).pipe(map((p) => p.isScreenShareEnabled));
}
