/*
Copyright 2025 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import {
  ConnectionState as LivekitConnectionState,
  type LocalTrackPublication,
  LocalVideoTrack,
  ParticipantEvent,
  type Room as LivekitRoom,
  Track,
} from "livekit-client";
import {
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
import { observeTrackReference$ } from "../../observeTrackReference";
import { type Connection } from "../remoteMembers/Connection.ts";
import { ObservableScope } from "../../ObservableScope.ts";

/**
 * A wrapper for a Connection object.
 * This wrapper will manage the connection used to publish to the LiveKit room.
 * The Publisher is also responsible for creating the media tracks.
 */
export class Publisher {
  /**
   * By default, livekit will start publishing tracks as soon as they are created.
   * In the matrix RTC world, we want to control when tracks are published based
   * on whether the user is part of the RTC session or not.
   */
  public shouldPublish = false;

  private readonly scope = new ObservableScope();

  /**
   * Creates a new Publisher.
   * @param connection - The connection to use for publishing.
   * @param devices - The media devices to use for audio and video input.
   * @param muteStates - The mute states for audio and video.
   * @param trackerProcessorState$ - The processor state for the video track processor (e.g. background blur).
   * @param logger - The logger to use for logging :D.
   */
  public constructor(
    private connection: Pick<Connection, "livekitRoom" | "state$">, //setE2EEEnabled,
    devices: MediaDevices,
    private readonly muteStates: MuteStates,
    trackerProcessorState$: Behavior<ProcessorState>,
    private logger: Logger,
  ) {
    const { controlledAudioDevices } = getUrlParams();
    const room = connection.livekitRoom;

    room.setE2EEEnabled(room.options.e2ee !== undefined)?.catch((e: Error) => {
      this.logger.error("Failed to set E2EE enabled on room", e);
    });

    // Setup track processor syncing (blur)
    this.observeTrackProcessors(this.scope, room, trackerProcessorState$);
    // Observe media device changes and update LiveKit active devices accordingly
    this.observeMediaDevices(this.scope, devices, controlledAudioDevices);

    this.workaroundRestartAudioInputTrackChrome(devices, this.scope);

    this.connection.livekitRoom.localParticipant.on(
      ParticipantEvent.LocalTrackPublished,
      this.onLocalTrackPublished.bind(this),
    );
  }

  public async destroy(): Promise<void> {
    this.scope.end();
    this.logger.info("Scope ended -> unset handler");
    this.muteStates.audio.unsetHandler();
    this.muteStates.video.unsetHandler();

    this.logger.info(`Start to stop tracks`);
    try {
      await this.stopTracks();
      this.logger.info(`Done to stop tracks`);
    } catch (e) {
      this.logger.error(`Failed to stop tracks: ${e}`);
    }
  }

  // LiveKit will publish the tracks as soon as they are created
  // but we want to control when tracks are published.
  // We cannot just mute the tracks, even if this will effectively stop the publishing,
  // it would also prevent the user from seeing their own video/audio preview.
  // So for that we use pauseUpStream():  Stops sending media to the server by replacing
  // the sender track with null, but keeps the local MediaStreamTrack active.
  // The user can still see/hear themselves locally, but remote participants see nothing.
  private onLocalTrackPublished(
    localTrackPublication: LocalTrackPublication,
  ): void {
    this.logger.info("Local track published", localTrackPublication);
    const lkRoom = this.connection.livekitRoom;
    if (!this.shouldPublish) {
      this.logger.debug("Not publishing, pausing upstream");
      this.pauseUpstreams(lkRoom, [localTrackPublication.source]).catch((e) => {
        this.logger.error(`Failed to pause upstreams`, e);
      });
    }
    if (localTrackPublication.source === Track.Source.Microphone) {
      const muteState = this.muteStates.audio;
      // skip this if a sync is in progress: enabled$ still reflects the old
      // state while the handler is mid-flight, so the handler itself will apply
      // the correct mute state once it completes.
      if (!muteState.syncing$.value) {
        const enabled = muteState.enabled$.value;
        if (!enabled) {
          this.logger.info(
            "Local audio track just published but muted meanwhile, setting enabled to false",
          );
          lkRoom.localParticipant.setMicrophoneEnabled(false).catch((e) => {
            this.logger.error(
              `Failed to enable microphone track, enabled:${enabled}`,
              e,
            );
          });
        }
      }
    } else if (localTrackPublication.source === Track.Source.Camera) {
      const muteState = this.muteStates.video;
      // skip this if a sync is in progress: enabled$ still reflects the old
      // state while the handler is mid-flight, so the handler itself will apply
      // the correct mute state once it completes.
      if (!muteState.syncing$.value) {
        const enabled = muteState.enabled$.value;
        if (!enabled) {
          this.logger.info(
            "Local video track just published but muted meanwhile, setting enabled to false",
          );
          lkRoom.localParticipant.setCameraEnabled(false).catch((e) => {
            this.logger.error(
              `Failed to enable camera track, enabled:${enabled}`,
              e,
            );
          });
        }
      }
    }
  }
  /**
   * Create and setup local audio and video tracks based on the current mute states.
   * It creates the tracks only if audio and/or video is enabled, to avoid unnecessary
   * permission prompts.
   *
   * It also observes mute state changes to update LiveKit microphone/camera states accordingly.
   * If a track is not created initially because disabled, it will be created when unmuting.
   *
   * This call is not blocking anymore, instead callers can listen to the
   * `RoomEvent.MediaDevicesError` event in the LiveKit room to be notified of any errors.
   *
   */
  public async createAndSetupTracks(): Promise<void> {
    this.logger.debug("createAndSetupTracks called");
    const lkRoom = this.connection.livekitRoom;
    // Observe mute state changes and update LiveKit microphone/camera states accordingly
    this.observeMuteStates();

    // Check if audio and/or video is enabled. We only create tracks if enabled,
    // because it could prompt for permission, and we don't want to do that unnecessarily.
    const audio = this.muteStates.audio.enabled$.value;
    const video = this.muteStates.video.enabled$.value;

    // We don't await the creation, because livekit could block until the tracks
    // are fully published, and not only that they are created.
    // We don't have control on that, localParticipant creates and publishes the tracks
    // asap.
    // We are using the `ParticipantEvent.LocalTrackPublished` to be notified
    // when tracks are actually published, and at that point
    // we can pause upstream if needed (depending on if startPublishing has been called).
    if (audio && video) {
      // Enable both at once in order to have a single permission prompt!
      void lkRoom.localParticipant.enableCameraAndMicrophone();
    } else if (audio) {
      void lkRoom.localParticipant.setMicrophoneEnabled(true);
    } else if (video) {
      void lkRoom.localParticipant.setCameraEnabled(true);
    }

    return Promise.resolve();
  }

  private async pauseUpstreams(
    lkRoom: LivekitRoom,
    sources: Track.Source[],
  ): Promise<void> {
    for (const source of sources) {
      const track = lkRoom.localParticipant.getTrackPublication(source)?.track;
      if (track) {
        await track.pauseUpstream();
      } else {
        this.logger.warn(
          `No track found for source ${source} to pause upstream`,
        );
      }
    }
  }

  private async resumeUpstreams(
    lkRoom: LivekitRoom,
    sources: Track.Source[],
  ): Promise<void> {
    for (const source of sources) {
      const track = lkRoom.localParticipant.getTrackPublication(source)?.track;
      if (track) {
        await track.resumeUpstream();
      } else {
        this.logger.warn(
          `No track found for source ${source} to resume upstream`,
        );
      }
    }
  }

  /**
   *
   * Request to publish local tracks to the LiveKit room.
   * This will wait for the connection to be ready before publishing.
   * Livekit also have some local retry logic for publishing tracks.
   * Can be called multiple times, localparticipant manages the state of published tracks (or pending publications).
   *
   * @returns
   */
  public async startPublishing(): Promise<void> {
    if (this.shouldPublish) {
      this.logger.debug(`Already publishing, ignoring startPublishing call`);
      return;
    }
    this.shouldPublish = true;
    this.logger.debug("startPublishing called");

    const lkRoom = this.connection.livekitRoom;

    // Resume upstream for both audio and video tracks
    // We need to call it explicitly because call setTrackEnabled does not always
    // resume upstream. It will only if you switch the track from disabled to enabled,
    // but if the track is already enabled but upstream is paused, it won't resume it.
    // TODO what about screen share?
    try {
      await this.resumeUpstreams(lkRoom, [
        Track.Source.Microphone,
        Track.Source.Camera,
      ]);
    } catch (e) {
      this.logger.error(`Failed to resume upstreams`, e);
    }
  }

  public async stopPublishing(): Promise<void> {
    this.logger.debug("stopPublishing called");
    this.shouldPublish = false;
    // Pause upstream will stop sending media to the server, while keeping
    // the local MediaStreamTrack active, so the user can still see themselves.
    await this.pauseUpstreams(this.connection.livekitRoom, [
      Track.Source.Microphone,
      Track.Source.Camera,
      Track.Source.ScreenShare,
    ]);
  }

  public async stopTracks(): Promise<void> {
    const lkRoom = this.connection.livekitRoom;
    for (const source of [
      Track.Source.Microphone,
      Track.Source.Camera,
      Track.Source.ScreenShare,
    ]) {
      const localPub = lkRoom.localParticipant.getTrackPublication(source);
      if (localPub?.track) {
        // stops and unpublishes the track
        await lkRoom.localParticipant.unpublishTrack(localPub!.track, true);
      }
    }
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
   * @private
   */
  private observeMuteStates(): void {
    const lkRoom = this.connection.livekitRoom;
    this.muteStates.audio.setHandler(async (enable) => {
      try {
        this.logger.debug(
          `handler: Setting LiveKit microphone enabled: ${enable}`,
        );
        await lkRoom.localParticipant.setMicrophoneEnabled(enable);
        // Unmute will restart the track if it was paused upstream,
        // but until explicitly requested, we want to keep it paused.
        if (!this.shouldPublish && enable) {
          await this.pauseUpstreams(lkRoom, [Track.Source.Microphone]);
        }
        return enable;
      } catch (e) {
        this.logger.error("Failed to update LiveKit audio input mute state", e);
        return lkRoom.localParticipant.isMicrophoneEnabled;
      }
    });
    this.muteStates.video.setHandler(async (enable) => {
      try {
        this.logger.debug(`handler: Setting LiveKit camera enabled: ${enable}`);
        await lkRoom.localParticipant.setCameraEnabled(enable);
        // Unmute will restart the track if it was paused upstream,
        // but until explicitly requested, we want to keep it paused.
        if (!this.shouldPublish && enable) {
          await this.pauseUpstreams(lkRoom, [Track.Source.Camera]);
        }
        return enable;
      } catch (e) {
        this.logger.error("Failed to update LiveKit video input mute state", e);
        return lkRoom.localParticipant.isCameraEnabled;
      }
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
          const track = trackRef?.publication.track;
          return track instanceof LocalVideoTrack ? track : null;
        }),
      ),
      null,
    );
    trackProcessorSync(scope, track$, trackerProcessorState$);
  }
}
