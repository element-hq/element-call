/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import {
  ConnectionState,
  type E2EEOptions,
  LocalVideoTrack,
  Room as LivekitRoom,
  type RoomOptions,
  Track,
} from "livekit-client";
import {
  map,
  NEVER,
  type Observable,
  type Subscription,
  switchMap,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import type { Behavior } from "./Behavior.ts";
import type { MediaDevices, SelectedDevice } from "./MediaDevices.ts";
import type { MuteStates } from "./MuteStates.ts";
import {
  type ProcessorState,
  trackProcessorSync,
} from "../livekit/TrackProcessorContext.tsx";
import { getUrlParams } from "../UrlParams.ts";
import { defaultLiveKitOptions } from "../livekit/options.ts";
import { getValue } from "../utils/observable.ts";
import { observeTrackReference$ } from "./MediaViewModel.ts";
import { Connection, type ConnectionOpts } from "./Connection.ts";
import { type ObservableScope } from "./ObservableScope.ts";

/**
 * A connection to the local LiveKit room, the one the user is publishing to.
 * This connection will publish the local user's audio and video tracks.
 */
export class PublishConnection extends Connection {
  private readonly scope: ObservableScope;

  /**
   * Creates a new PublishConnection.
   * @param args - The connection options. {@link ConnectionOpts}
   * @param devices - The media devices to use for audio and video input.
   * @param muteStates - The mute states for audio and video.
   * @param e2eeLivekitOptions - The E2EE options to use for the LiveKit room. Use to share the same key provider across connections!.
   * @param trackerProcessorState$ - The processor state for the video track processor (e.g. background blur).
   */
  public constructor(
    args: ConnectionOpts,
    devices: MediaDevices,
    private readonly muteStates: MuteStates,
    e2eeLivekitOptions: E2EEOptions | undefined,
    trackerProcessorState$: Behavior<ProcessorState>,
  ) {
    const { scope } = args;
    logger.info("[PublishConnection] Create LiveKit room");
    const { controlledAudioDevices } = getUrlParams();

    const factory =
      args.livekitRoomFactory ??
      ((options: RoomOptions): LivekitRoom => new LivekitRoom(options));
    const room = factory(
      generateRoomOption(
        devices,
        trackerProcessorState$.value,
        controlledAudioDevices,
        e2eeLivekitOptions,
      ),
    );
    room.setE2EEEnabled(e2eeLivekitOptions !== undefined)?.catch((e) => {
      logger.error("Failed to set E2EE enabled on room", e);
    });

    super(room, args);
    this.scope = scope;

    // Setup track processor syncing (blur)
    this.observeTrackProcessors(scope, room, trackerProcessorState$);
    // Observe media device changes and update LiveKit active devices accordingly
    this.observeMediaDevices(scope, devices, controlledAudioDevices);

    this.workaroundRestartAudioInputTrackChrome(devices, scope);
  }

  /**
   * Start the connection to LiveKit and publish local tracks.
   *
   * This will:
   * 1. Request an OpenId token `request_token` (allows matrix users to verify their identity with a third-party service.)
   * 2. Use this token to request the SFU config to the MatrixRtc authentication service.
   * 3. Connect to the configured LiveKit room.
   * 4. Create local audio and video tracks based on the current mute states and publish them to the room.
   *
   * @throws {InsufficientCapacityError} if the LiveKit server indicates that it has insufficient capacity to accept the connection.
   * @throws {SFURoomCreationRestrictedError} if the LiveKit server indicates that the room does not exist and cannot be created.
   */
  public async start(): Promise<void> {
    this.stopped = false;

    // Observe mute state changes and update LiveKit microphone/camera states accordingly
    this.observeMuteStates(this.scope);

    // TODO: This will fetch the JWT token. Perhaps we could keep it preloaded
    // instead? This optimization would only be safe for a publish connection,
    // because we don't want to leak the user's intent to perhaps join a call to
    // remote servers before they actually commit to it.
    await super.start();

    if (this.stopped) return;

    // TODO-MULTI-SFU: Prepublish a microphone track
    const audio = this.muteStates.audio.enabled$.value;
    const video = this.muteStates.video.enabled$.value;
    // createTracks throws if called with audio=false and video=false
    if (audio || video) {
      // TODO this can still throw errors? It will also prompt for permissions if not already granted
      const tracks = await this.livekitRoom.localParticipant.createTracks({
        audio,
        video,
      });
      if (this.stopped) return;
      for (const track of tracks) {
        // TODO: handle errors? Needs the signaling connection to be up, but it has some retries internally
        // with a timeout.
        await this.livekitRoom.localParticipant.publishTrack(track);
        if (this.stopped) return;
        // TODO: check if the connection is still active? and break the loop if not?
      }
    }
  }

  public async stop(): Promise<void> {
    // TODO-MULTI-SFU: Move these calls back to ObservableScope.onEnd once scope
    // actually has the right lifetime
    this.muteStates.audio.unsetHandler();
    this.muteStates.video.unsetHandler();
    await super.stop();
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
    devices.audioInput.selected$
      .pipe(
        switchMap((device) => device?.hardwareDeviceChange$ ?? NEVER),
        scope.bind(),
      )
      .subscribe(() => {
        if (this.livekitRoom.state != ConnectionState.Connected) return;
        const activeMicTrack = Array.from(
          this.livekitRoom.localParticipant.audioTrackPublications.values(),
        ).find((d) => d.source === Track.Source.Microphone)?.track;

        if (
          activeMicTrack &&
          // only restart if the stream is still running: LiveKit will detect
          // when a track stops & restart appropriately, so this is not our job.
          // Plus, we need to avoid restarting again if the track is already in
          // the process of being restarted.
          activeMicTrack.mediaStreamTrack.readyState !== "ended"
        ) {
          // Restart the track, which will cause Livekit to do another
          // getUserMedia() call with deviceId: default to get the *new* default device.
          // Note that room.switchActiveDevice() won't work: Livekit will ignore it because
          // the deviceId hasn't changed (was & still is default).
          this.livekitRoom.localParticipant
            .getTrackPublication(Track.Source.Microphone)
            ?.audioTrack?.restartTrack()
            .catch((e) => {
              logger.error(`Failed to restart audio device track`, e);
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
    const syncDevice = (
      kind: MediaDeviceKind,
      selected$: Observable<SelectedDevice | undefined>,
    ): Subscription =>
      selected$.pipe(scope.bind()).subscribe((device) => {
        if (this.livekitRoom.state != ConnectionState.Connected) return;
        // if (this.connectionState$.value !== ConnectionState.Connected) return;
        logger.info(
          "[LivekitRoom] syncDevice room.getActiveDevice(kind) !== d.id :",
          this.livekitRoom.getActiveDevice(kind),
          " !== ",
          device?.id,
        );
        if (
          device !== undefined &&
          this.livekitRoom.getActiveDevice(kind) !== device.id
        ) {
          this.livekitRoom
            .switchActiveDevice(kind, device.id)
            .catch((e) =>
              logger.error(`Failed to sync ${kind} device with LiveKit`, e),
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
    this.muteStates.audio.setHandler(async (desired) => {
      try {
        await this.livekitRoom.localParticipant.setMicrophoneEnabled(desired);
      } catch (e) {
        logger.error("Failed to update LiveKit audio input mute state", e);
      }
      return this.livekitRoom.localParticipant.isMicrophoneEnabled;
    });
    this.muteStates.video.setHandler(async (desired) => {
      try {
        await this.livekitRoom.localParticipant.setCameraEnabled(desired);
      } catch (e) {
        logger.error("Failed to update LiveKit video input mute state", e);
      }
      return this.livekitRoom.localParticipant.isCameraEnabled;
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
    );
    trackProcessorSync(track$, trackerProcessorState$);
  }
}

// Generate the initial LiveKit RoomOptions based on the current media devices and processor state.
function generateRoomOption(
  devices: MediaDevices,
  processorState: ProcessorState,
  controlledAudioDevices: boolean,
  e2eeLivekitOptions: E2EEOptions | undefined,
): RoomOptions {
  return {
    ...defaultLiveKitOptions,
    videoCaptureDefaults: {
      ...defaultLiveKitOptions.videoCaptureDefaults,
      deviceId: devices.videoInput.selected$.value?.id,
      processor: processorState.processor,
    },
    audioCaptureDefaults: {
      ...defaultLiveKitOptions.audioCaptureDefaults,
      deviceId: devices.audioInput.selected$.value?.id,
    },
    audioOutput: {
      // When using controlled audio devices, we don't want to set the
      // deviceId here, because it will be set by the native app.
      // (also the id does not need to match a browser device id)
      deviceId: controlledAudioDevices
        ? undefined
        : getValue(devices.audioOutput.selected$)?.id,
    },
    e2ee: e2eeLivekitOptions,
  };
}
