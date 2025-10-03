/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  connectedParticipantsObserver,
  connectionStateObserver,
} from "@livekit/components-core";
import {
  ConnectionState,
  Room as LivekitRoom,
  type E2EEOptions,
  Track,
  LocalVideoTrack,
} from "livekit-client";
import { type MatrixClient } from "matrix-js-sdk";
import {
  type LivekitTransport,
  type CallMembership,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  combineLatest,
  map,
  NEVER,
  type Observable,
  type Subscription,
  switchMap,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type SelectedDevice, type MediaDevices } from "./MediaDevices";
import { getSFUConfigWithOpenID } from "../livekit/openIDSFU";
import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { defaultLiveKitOptions } from "../livekit/options";
import { getValue } from "../utils/observable";
import { getUrlParams } from "../UrlParams";
import { type MuteStates } from "./MuteStates";
import {
  type ProcessorState,
  trackProcessorSync,
} from "../livekit/TrackProcessorContext";
import { observeTrackReference$ } from "./MediaViewModel";

export class Connection {
  protected stopped = false;

  public async start(): Promise<void> {
    this.stopped = false;
    const { url, jwt } = await this.sfuConfig;
    if (!this.stopped) await this.livekitRoom.connect(url, jwt);
  }

  public stop(): void {
    if (this.stopped) return;
    void this.livekitRoom.disconnect();
    this.stopped = true;
  }

  protected readonly sfuConfig = getSFUConfigWithOpenID(
    this.client,
    this.transport.livekit_service_url,
    this.livekitAlias,
  );

  public readonly participantsIncludingSubscribers$;
  public readonly publishingParticipants$;
  public readonly livekitRoom: LivekitRoom;

  public connectionState$: Behavior<ConnectionState>;
  public constructor(
    public readonly transport: LivekitTransport,
    protected readonly livekitAlias: string,
    protected readonly client: MatrixClient,
    protected readonly scope: ObservableScope,
    protected readonly remoteTransports$: Behavior<
      { membership: CallMembership; transport: LivekitTransport }[]
    >,
    e2eeLivekitOptions: E2EEOptions | undefined,
    livekitRoom: LivekitRoom | undefined = undefined,
  ) {
    this.livekitRoom =
      livekitRoom ??
      new LivekitRoom({
        ...defaultLiveKitOptions,
        e2ee: e2eeLivekitOptions,
      });
    this.participantsIncludingSubscribers$ = this.scope.behavior(
      connectedParticipantsObserver(this.livekitRoom),
      [],
    );

    this.publishingParticipants$ = this.scope.behavior(
      combineLatest(
        [this.participantsIncludingSubscribers$, this.remoteTransports$],
        (participants, remoteTransports) =>
          remoteTransports
            // Find all members that claim to publish on this connection
            .flatMap(({ membership, transport }) =>
              transport.livekit_service_url ===
              this.transport.livekit_service_url
                ? [membership]
                : [],
            )
            // Find all associated publishing livekit participant objects
            .flatMap((membership) => {
              const participant = participants.find(
                (p) =>
                  p.identity === `${membership.sender}:${membership.deviceId}`,
              );
              return participant ? [{ participant, membership }] : [];
            }),
      ),
      [],
    );
    this.connectionState$ = this.scope.behavior<ConnectionState>(
      connectionStateObserver(this.livekitRoom),
    );

    this.scope.onEnd(() => this.stop());
  }
}

export class PublishConnection extends Connection {
  public async start(): Promise<void> {
    this.stopped = false;
    const { url, jwt } = await this.sfuConfig;
    if (!this.stopped) await this.livekitRoom.connect(url, jwt);

    if (!this.stopped) {
      // TODO-MULTI-SFU: Prepublish a microphone track
      const audio = this.muteStates.audio.enabled$.value;
      const video = this.muteStates.video.enabled$.value;
      // createTracks throws if called with audio=false and video=false
      if (audio || video) {
        const tracks = await this.livekitRoom.localParticipant.createTracks({
          audio,
          video,
        });
        for (const track of tracks) {
          await this.livekitRoom.localParticipant.publishTrack(track);
        }
      }
    }
  }

  public stop(): void {
    this.muteStates.audio.unsetHandler();
    this.muteStates.video.unsetHandler();
    super.stop();
  }

  public constructor(
    transport: LivekitTransport,
    livekitAlias: string,
    client: MatrixClient,
    scope: ObservableScope,
    remoteTransports$: Behavior<
      { membership: CallMembership; transport: LivekitTransport }[]
    >,
    devices: MediaDevices,
    private readonly muteStates: MuteStates,
    e2eeLivekitOptions: E2EEOptions | undefined,
    trackerProcessorState$: Behavior<ProcessorState>,
  ) {
    logger.info("[LivekitRoom] Create LiveKit room");
    const { controlledAudioDevices } = getUrlParams();

    const room = new LivekitRoom({
      ...defaultLiveKitOptions,
      videoCaptureDefaults: {
        ...defaultLiveKitOptions.videoCaptureDefaults,
        deviceId: devices.videoInput.selected$.value?.id,
        processor: trackerProcessorState$.value.processor,
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
    });
    room.setE2EEEnabled(e2eeLivekitOptions !== undefined).catch((e) => {
      logger.error("Failed to set E2EE enabled on room", e);
    });

    super(
      transport,
      livekitAlias,
      client,
      scope,
      remoteTransports$,
      e2eeLivekitOptions,
      room,
    );

    // Setup track processor syncing (blur)
    const track$ = this.scope.behavior(
      observeTrackReference$(room.localParticipant, Track.Source.Camera).pipe(
        map((trackRef) => {
          const track = trackRef?.publication?.track;
          return track instanceof LocalVideoTrack ? track : null;
        }),
      ),
    );
    trackProcessorSync(track$, trackerProcessorState$);

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

    const syncDevice = (
      kind: MediaDeviceKind,
      selected$: Observable<SelectedDevice | undefined>,
    ): Subscription =>
      selected$.pipe(this.scope.bind()).subscribe((device) => {
        if (this.connectionState$.value !== ConnectionState.Connected) return;
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
    // Restart the audio input track whenever we detect that the active media
    // device has changed to refer to a different hardware device. We do this
    // for the sake of Chrome, which provides a "default" device that is meant
    // to match the system's default audio input, whatever that may be.
    // This is special-cased for only audio inputs because we need to dig around
    // in the LocalParticipant object for the track object and there's not a nice
    // way to do that generically. There is usually no OS-level default video capture
    // device anyway, and audio outputs work differently.
    devices.audioInput.selected$
      .pipe(
        switchMap((device) => device?.hardwareDeviceChange$ ?? NEVER),
        this.scope.bind(),
      )
      .subscribe(() => {
        if (this.connectionState$.value !== ConnectionState.Connected) return;
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
}
