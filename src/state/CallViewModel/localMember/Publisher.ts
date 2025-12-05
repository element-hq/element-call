/*
Copyright 2025 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import {
  LocalVideoTrack,
  type Room as LivekitRoom,
  Track,
  type LocalTrack,
  type LocalTrackPublication,
  ConnectionState as LivekitConnectionState,
} from "livekit-client";
import {
  BehaviorSubject,
  map,
  NEVER,
  type Observable,
  type Subscription,
  switchMap,
} from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";

import type { Behavior } from "../../Behavior.ts";
import type { MediaDevices, SelectedDevice } from "../../MediaDevices.ts";
import type { MuteStates } from "../../MuteStates.ts";
import {
  type ProcessorState,
  trackProcessorSync,
} from "../../../livekit/TrackProcessorContext.tsx";
import { getUrlParams } from "../../../UrlParams.ts";
import { observeTrackReference$ } from "../../MediaViewModel.ts";
import { type Connection } from "../remoteMembers/Connection.ts";
import { type ObservableScope } from "../../ObservableScope.ts";
import {
  ElementCallError,
  FailToStartLivekitConnection,
} from "../../../utils/errors.ts";

/**
 * A wrapper for a Connection object.
 * This wrapper will manage the connection used to publish to the LiveKit room.
 * The Publisher is also responsible for creating the media tracks.
 */
export class Publisher {
  /**
   * Creates a new Publisher.
   * @param scope - The observable scope to use for managing the publisher.
   * @param connection - The connection to use for publishing.
   * @param devices - The media devices to use for audio and video input.
   * @param muteStates - The mute states for audio and video.
   * @param e2eeLivekitOptions - The E2EE options to use for the LiveKit room. Use to share the same key provider across connections!.
   * @param trackerProcessorState$ - The processor state for the video track processor (e.g. background blur).
   */
  public constructor(
    private scope: ObservableScope,
    private connection: Pick<Connection, "livekitRoom" | "state$">, //setE2EEEnabled,
    devices: MediaDevices,
    private readonly muteStates: MuteStates,
    trackerProcessorState$: Behavior<ProcessorState>,
    private logger: Logger,
  ) {
    this.logger.info("Create LiveKit room");
    const { controlledAudioDevices } = getUrlParams();

    const room = connection.livekitRoom;

    room.setE2EEEnabled(room.options.e2ee !== undefined)?.catch((e: Error) => {
      this.logger.error("Failed to set E2EE enabled on room", e);
    });

    // Setup track processor syncing (blur)
    this.observeTrackProcessors(scope, room, trackerProcessorState$);
    // Observe media device changes and update LiveKit active devices accordingly
    this.observeMediaDevices(scope, devices, controlledAudioDevices);

    this.workaroundRestartAudioInputTrackChrome(devices, scope);
    this.scope.onEnd(() => {
      this.logger.info("Scope ended -> stop publishing all tracks");
      void this.stopPublishing();
    });

    // TODO move mute state handling here using reconcile (instead of inside the mute state class)
    // this.scope.reconcile(
    //   this.scope.behavior(
    //     combineLatest([this.muteStates.video.enabled$, this.tracks$]),
    //   ),
    //   async ([videoEnabled, tracks]) => {
    //     const track = tracks.find((t) => t.kind == Track.Kind.Video);
    //     if (!track) return;

    //     if (videoEnabled) {
    //       await track.unmute();
    //     } else {
    //       await track.mute();
    //     }
    //   },
    // );
  }

  private _tracks$ = new BehaviorSubject<LocalTrack<Track.Kind>[]>([]);
  public tracks$ = this._tracks$ as Behavior<LocalTrack<Track.Kind>[]>;

  /**
   * Start the connection to LiveKit and publish local tracks.
   *
   * This will:
   * wait for the connection to be ready.
   // * 1. Request an OpenId token `request_token` (allows matrix users to verify their identity with a third-party service.)
   // * 2. Use this token to request the SFU config to the MatrixRtc authentication service.
   // * 3. Connect to the configured LiveKit room.
   // * 4. Create local audio and video tracks based on the current mute states and publish them to the room.
   *
   * @throws {InsufficientCapacityError} if the LiveKit server indicates that it has insufficient capacity to accept the connection.
   * @throws {SFURoomCreationRestrictedError} if the LiveKit server indicates that the room does not exist and cannot be created.
   */
  public async createAndSetupTracks(): Promise<void> {
    this.logger.debug("createAndSetupTracks called");
    const lkRoom = this.connection.livekitRoom;
    // Observe mute state changes and update LiveKit microphone/camera states accordingly
    this.observeMuteStates(this.scope);

    // TODO-MULTI-SFU: Prepublish a microphone track
    const audio = this.muteStates.audio.enabled$.value;
    const video = this.muteStates.video.enabled$.value;
    // createTracks throws if called with audio=false and video=false
    if (audio || video) {
      // TODO this can still throw errors? It will also prompt for permissions if not already granted
      return lkRoom.localParticipant
        .createTracks({
          audio,
          video,
        })
        .then((tracks) => {
          this.logger.info(
            "created track",
            tracks.map((t) => t.kind + ", " + t.id),
          );
          this._tracks$.next(tracks);
        })
        .catch((error) => {
          this.logger.error("Failed to create tracks", error);
        });
    }
    // TODO why throw here? should we just do nothing?
    throw Error("audio and video is false");
  }

  private _publishing$ = new BehaviorSubject<boolean>(false);
  public publishing$ = this.scope.behavior(this._publishing$);
  /**
   *
   * @returns
   * @throws ElementCallError
   */
  public async startPublishing(): Promise<LocalTrack[]> {
    this.logger.debug("startPublishing called");
    const lkRoom = this.connection.livekitRoom;
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const sub = this.connection.state$.subscribe((s) => {
      switch (s.state) {
        case "ConnectedToLkRoom":
          resolve();
          break;
        case "FailedToStart":
          reject(
            s.error instanceof ElementCallError
              ? s.error
              : new FailToStartLivekitConnection(s.error.message),
          );
          break;
        default:
          this.logger.info("waiting for connection: ", s.state);
      }
    });
    try {
      await promise;
    } catch (e) {
      throw e;
    } finally {
      sub.unsubscribe();
    }

    for (const track of this.tracks$.value) {
      this.logger.info("publish ", this.tracks$.value.length, "tracks");

      // XXXX: Patch: Check if the track has been muted manually before publishing
      // This is only a patch, the proper way would be to use livekit high-level enabled/disabled APIs
      // or only use the low level create/publish APIs and have our own pending publication protection.
      // Maybe we could change the livekit api to pre-load tracks without publishing them yet?
      // Are we sure this is needed at all? What are the gains?
      let isEnabled: boolean;
      if (track.kind === Track.Kind.Audio) {
        isEnabled = this.muteStates.audio.enabled$.value;
      } else if (track.kind === Track.Kind.Video) {
        isEnabled = this.muteStates.video.enabled$.value;
      } else {
        throw new Error("Unsupported track kind " + track.kind);
      }

      if (!isEnabled) {
        // TODO should we also drop it?
        // I believe the high-level LiveKit APIs will recreate a track?
        await track.mute();
      } else {
        // TODO: handle errors? Needs the signaling connection to be up, but it has some retries internally
        // with a timeout.
        await lkRoom.localParticipant.publishTrack(track).catch((error) => {
          this.logger.error("Failed to publish track", error);
          throw new FailToStartLivekitConnection(
            error instanceof Error ? error.message : error,
          );
        });
        this.logger.info("published track ", track.kind, track.id);
      }
      // TODO: check if the connection is still active? and break the loop if not?
    }
    this._publishing$.next(true);
    return this.tracks$.value;
  }

  public async stopPublishing(): Promise<void> {
    this.logger.debug("stopPublishing called");
    // TODO-MULTI-SFU: Move these calls back to ObservableScope.onEnd once scope
    // actually has the right lifetime
    this.muteStates.audio.unsetHandler();
    this.muteStates.video.unsetHandler();

    const localParticipant = this.connection.livekitRoom.localParticipant;
    const tracks: LocalTrack[] = [];
    const addToTracksIfDefined = (p: LocalTrackPublication): void => {
      if (p.track !== undefined) tracks.push(p.track);
    };
    localParticipant.trackPublications.forEach(addToTracksIfDefined);
    this.logger.debug(
      "list of tracks to unpublish:",
      tracks.map((t) => t.kind + ", " + t.id),
      "start unpublishing now",
    );
    await localParticipant.unpublishTracks(tracks).catch((error) => {
      this.logger.error("Failed to unpublish tracks", error);
      throw error;
    });
    this.logger.debug(
      "unpublished tracks",
      tracks.map((t) => t.kind + ", " + t.id),
    );
    this._publishing$.next(false);
  }

  /**
   * Stops all tracks that are currently running
   */
  public stopTracks(): void {
    this.tracks$.value.forEach((t) => t.stop());
    this._tracks$.next([]);
  }

  /// Private methods

  // Restart the audio input track whenever we detect that the active media
  // device has changed to refer to a different hardware device. We do this
  // for the sake of Chrome, which provides a "default" device that is meant
  // to match the system's default audio input, whatever that may be.
  // This is special-cased for only audio inputs because we need to dig around
  // in the LocalParticipant object for the track object and there's not a nice
  // way to do that generically. There is usually no OS-level default video capture
  // device anyway, and audio outputs work differently.
  private workaroundRestartAudioInputTrackChrome(
    devices: MediaDevices,
    scope: ObservableScope,
  ): void {
    const lkRoom = this.connection.livekitRoom;
    devices.audioInput.selected$
      .pipe(
        switchMap((device) => device?.hardwareDeviceChange$ ?? NEVER),
        scope.bind(),
      )
      .subscribe(() => {
        if (lkRoom.state != LivekitConnectionState.Connected) return;
        const activeMicTrack = Array.from(
          lkRoom.localParticipant.audioTrackPublications.values(),
        ).find((d) => d.source === Track.Source.Microphone)?.track;

        if (
          activeMicTrack &&
          // only restart if the stream is still running: LiveKit will detect
          // when a track stops & restart appropriately, so this is not our job.
          // Plus, we need to avoid restarting again if the track is already in
          // the process of being restarted.
          activeMicTrack.mediaStreamTrack.readyState !== "ended"
        ) {
          this.logger?.info(
            "Restarting audio device track due to active media device changed (workaroundRestartAudioInputTrackChrome)",
          );
          // Restart the track, which will cause Livekit to do another
          // getUserMedia() call with deviceId: default to get the *new* default device.
          // Note that room.switchActiveDevice() won't work: Livekit will ignore it because
          // the deviceId hasn't changed (was & still is default).
          lkRoom.localParticipant
            .getTrackPublication(Track.Source.Microphone)
            ?.audioTrack?.restartTrack()
            .catch((e) => {
              this.logger.error(`Failed to restart audio device track`, e);
            });
        }
      });
  }

  // Observe changes in the selected media devices and update the LiveKit room accordingly.
  private observeMediaDevices(
    scope: ObservableScope,
    devices: MediaDevices,
    controlledAudioDevices: boolean,
  ): void {
    const lkRoom = this.connection.livekitRoom;
    const syncDevice = (
      kind: MediaDeviceKind,
      selected$: Observable<SelectedDevice | undefined>,
    ): Subscription =>
      selected$.pipe(scope.bind()).subscribe((device) => {
        if (lkRoom.state != LivekitConnectionState.Connected) return;
        // if (this.connectionState$.value !== ConnectionState.Connected) return;
        this.logger.info(
          "[LivekitRoom] syncDevice room.getActiveDevice(kind) !== d.id :",
          lkRoom.getActiveDevice(kind),
          " !== ",
          device?.id,
        );
        if (
          device !== undefined &&
          lkRoom.getActiveDevice(kind) !== device.id
        ) {
          lkRoom
            .switchActiveDevice(kind, device.id)
            .catch((e: Error) =>
              this.logger.error(
                `Failed to sync ${kind} device with LiveKit`,
                e,
              ),
            );
        }
      });

    syncDevice("audioinput", devices.audioInput.selected$);
    if (!controlledAudioDevices)
      syncDevice("audiooutput", devices.audioOutput.selected$);
    syncDevice("videoinput", devices.videoInput.selected$);
  }

  /**
   * Observe changes in the mute states and update the LiveKit room accordingly.
   * @param scope
   * @private
   */
  private observeMuteStates(scope: ObservableScope): void {
    const lkRoom = this.connection.livekitRoom;
    this.muteStates.audio.setHandler(async (desired) => {
      try {
        await lkRoom.localParticipant.setMicrophoneEnabled(desired);
      } catch (e) {
        this.logger.error("Failed to update LiveKit audio input mute state", e);
      }
      return lkRoom.localParticipant.isMicrophoneEnabled;
    });
    this.muteStates.video.setHandler(async (desired) => {
      try {
        await lkRoom.localParticipant.setCameraEnabled(desired);
      } catch (e) {
        this.logger.error("Failed to update LiveKit video input mute state", e);
      }
      return lkRoom.localParticipant.isCameraEnabled;
    });
  }

  private observeTrackProcessors(
    scope: ObservableScope,
    room: LivekitRoom,
    trackerProcessorState$: Behavior<ProcessorState>,
  ): void {
    const track$ = scope.behavior(
      observeTrackReference$(room.localParticipant, Track.Source.Camera).pipe(
        map((trackRef) => {
          const track = trackRef?.publication?.track;
          return track instanceof LocalVideoTrack ? track : null;
        }),
      ),
      null,
    );
    trackProcessorSync(scope, track$, trackerProcessorState$);
  }
}
