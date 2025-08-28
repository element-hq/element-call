// TODO-MULTI-SFU Add all device syncing logic from useLivekit
/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { connectedParticipantsObserver } from "@livekit/components-core";
import {
  ConnectionState,
  Room as LivekitRoom,
  type RoomOptions,
  type E2EEOptions,
  RoomEvent,
  Track,
} from "livekit-client";
import { type MatrixClient } from "matrix-js-sdk";
import {
  type LivekitFocus,
  type CallMembership,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  BehaviorSubject,
  combineLatest,
  filter,
  fromEvent,
  map,
  NEVER,
  type Observable,
  type Subscription,
  switchMap,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type SelectedDevice, type MediaDevices } from "./MediaDevices";
import { getSFUConfigWithOpenID } from "../livekit/openIDSFU";
import { constant, type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { defaultLiveKitOptions } from "../livekit/options";
import { getValue } from "../utils/observable";
import { getUrlParams } from "../UrlParams";
import { type MuteStates } from "../room/MuteStates";

export class Connection {
  protected stopped = false;

  public async start(): Promise<void> {
    this.stopped = false;
    const { url, jwt } = await this.sfuConfig;
    if (!this.stopped) await this.livekitRoom.connect(url, jwt);
  }

  public stop(): void {
    void this.livekitRoom.disconnect();
    this.stopped = true;
  }

  protected readonly sfuConfig = getSFUConfigWithOpenID(
    this.client,
    this.focus.livekit_service_url,
    this.livekitAlias,
  );

  public readonly participantsIncludingSubscribers$;
  public readonly publishingParticipants$;
  public livekitRoom: LivekitRoom;

  public connectionState$: Behavior<ConnectionState>;
  public constructor(
    protected readonly focus: LivekitFocus,
    protected readonly livekitAlias: string,
    protected readonly client: MatrixClient,
    protected readonly scope: ObservableScope,
    protected readonly membershipsFocusMap$: Behavior<
      { membership: CallMembership; focus: LivekitFocus }[]
    >,
    e2eeLivekitOptions: E2EEOptions | undefined,
  ) {
    this.livekitRoom = new LivekitRoom({
      ...defaultLiveKitOptions,
      e2ee: e2eeLivekitOptions,
    });
    this.participantsIncludingSubscribers$ = this.scope.behavior(
      connectedParticipantsObserver(this.livekitRoom),
      [],
    );

    this.publishingParticipants$ = this.scope.behavior(
      combineLatest([
        this.participantsIncludingSubscribers$,
        this.membershipsFocusMap$,
      ]).pipe(
        map(([participants, membershipsFocusMap]) =>
          membershipsFocusMap
            // Find all members that claim to publish on this connection
            .flatMap(({ membership, focus }) =>
              focus.livekit_service_url === this.focus.livekit_service_url
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
      ),
      [],
    );
    this.connectionState$ = this.scope.behavior<ConnectionState>(
      fromEvent<ConnectionState>(
        this.livekitRoom,
        RoomEvent.ConnectionStateChanged,
      ),
    );
  }
}

export class PublishConnection extends Connection {
  public async start(): Promise<void> {
    this.stopped = false;
    const { url, jwt } = await this.sfuConfig;
    if (!this.stopped) await this.livekitRoom.connect(url, jwt);

    if (!this.stopped) {
      const tracks = await this.livekitRoom.localParticipant.createTracks({
        audio: true,
        video: true,
      });
      for (const track of tracks) {
        await this.livekitRoom.localParticipant.publishTrack(track);
      }
    }
  }

  public stop(): void {
    void this.livekitRoom.disconnect();
    this.stopped = true;
  }

  public readonly participantsIncludingSubscribers$ = this.scope.behavior(
    connectedParticipantsObserver(this.livekitRoom),
    [],
  );
  private readonly muteStates$: Behavior<MuteStates>;
  private updatingMuteStates$ = new BehaviorSubject(false);

  public constructor(
    protected readonly focus: LivekitFocus,
    protected readonly livekitAlias: string,
    protected readonly client: MatrixClient,
    protected readonly scope: ObservableScope,
    protected readonly membershipsFocusMap$: Behavior<
      { membership: CallMembership; focus: LivekitFocus }[]
    >,
    protected readonly devices: MediaDevices,
    e2eeLivekitOptions: E2EEOptions | undefined,
  ) {
    super(
      focus,
      livekitAlias,
      client,
      scope,
      membershipsFocusMap$,
      e2eeLivekitOptions,
    );

    // TODO-MULTI-SFU use actual mute states
    this.muteStates$ = constant({
      audio: { enabled: true, setEnabled: (enabled) => {} },
      video: { enabled: true, setEnabled: (enabled) => {} },
    });

    logger.info("[LivekitRoom] Create LiveKit room");
    const { controlledAudioDevices } = getUrlParams();

    const roomOptions: RoomOptions = {
      ...defaultLiveKitOptions,
      videoCaptureDefaults: {
        ...defaultLiveKitOptions.videoCaptureDefaults,
        deviceId: getValue(this.devices.videoInput.selected$)?.id,
        // TODO-MULTI-SFU add processor support back
        // processor,
      },
      audioCaptureDefaults: {
        ...defaultLiveKitOptions.audioCaptureDefaults,
        deviceId: getValue(devices.audioInput.selected$)?.id,
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
    // We have to create the room manually here due to a bug inside
    // @livekit/components-react. JSON.stringify() is used in deps of a
    // useEffect() with an argument that references itself, if E2EE is enabled
    const room = new LivekitRoom(roomOptions);
    room.setE2EEEnabled(e2eeLivekitOptions !== undefined).catch((e) => {
      logger.error("Failed to set E2EE enabled on room", e);
    });
    this.livekitRoom = room;

    // sync mute states TODO-MULTI_SFU This possibly can be simplified quite a bit.
    combineLatest([
      this.connectionState$,
      this.muteStates$,
      this.updatingMuteStates$,
    ])
      .pipe(
        filter(([_c, _m, updating]) => !updating),
        this.scope.bind(),
      )
      .subscribe(([connectionState, muteStates, _]) => {
        // Sync the requested mute states with LiveKit's mute states. We do it this
        // way around rather than using LiveKit as the source of truth, so that the
        // states can be consistent throughout the lobby and loading screens.
        // It's important that we only do this in the connected state, because
        // LiveKit's internal mute states aren't consistent during connection setup,
        // and setting tracks to be enabled during this time causes errors.
        if (
          this.livekitRoom !== undefined &&
          connectionState === ConnectionState.Connected
        ) {
          const participant = this.livekitRoom.localParticipant;

          enum MuteDevice {
            Microphone,
            Camera,
          }

          const syncMuteState = async (
            iterCount: number,
            type: MuteDevice,
          ): Promise<void> => {
            // The approach for muting is to always bring the actual livekit state in sync with the button
            // This allows for a very predictable and reactive behavior for the user.
            // (the new state is the old state when pressing the button n times (where n is even))
            // (the new state is different to the old state when pressing the button n times (where n is uneven))
            // In case there are issues with the device there might be situations where setMicrophoneEnabled/setCameraEnabled
            // return immediately. This should be caught with the Error("track with new mute state could not be published").
            // For now we are still using an iterCount to limit the recursion loop to 10.
            // This could happen if the device just really does not want to turn on (hardware based issue)
            // but the mute button is in unmute state.
            // For now our fail mode is to just stay in this state.
            // TODO: decide for a UX on how that fail mode should be treated (disable button, hide button, sync button back to muted without user input)

            if (iterCount > 10) {
              logger.error(
                "Stop trying to sync the input device with current mute state after 10 failed tries",
              );
              return;
            }
            let devEnabled;
            let btnEnabled;
            switch (type) {
              case MuteDevice.Microphone:
                devEnabled = participant.isMicrophoneEnabled;
                btnEnabled = muteStates.audio.enabled;
                break;
              case MuteDevice.Camera:
                devEnabled = participant.isCameraEnabled;
                btnEnabled = muteStates.video.enabled;
                break;
            }
            if (devEnabled !== btnEnabled && !this.updatingMuteStates$.value) {
              this.updatingMuteStates$.next(true);

              try {
                let trackPublication;
                switch (type) {
                  case MuteDevice.Microphone:
                    trackPublication = await participant.setMicrophoneEnabled(
                      btnEnabled,
                      this.livekitRoom.options.audioCaptureDefaults,
                    );
                    break;
                  case MuteDevice.Camera:
                    trackPublication = await participant.setCameraEnabled(
                      btnEnabled,
                      this.livekitRoom.options.videoCaptureDefaults,
                    );
                    break;
                }

                if (trackPublication) {
                  // await participant.setMicrophoneEnabled can return immediately in some instances,
                  // so that participant.isMicrophoneEnabled !== buttonEnabled.current.audio still holds true.
                  // This happens if the device is still in a pending state
                  // "sleeping" here makes sure we let react do its thing so that participant.isMicrophoneEnabled is updated,
                  // so we do not end up in a recursion loop.
                  await new Promise((r) => setTimeout(r, 100));

                  // track got successfully changed to mute/unmute
                  // Run the check again after the change is done. Because the user
                  // can update the state (presses mute button) while the device is enabling
                  // itself we need might need to update the mute state right away.
                  // This async recursion makes sure that setCamera/MicrophoneEnabled is
                  // called as little times as possible.
                  await syncMuteState(iterCount + 1, type);
                } else {
                  throw new Error(
                    "track with new mute state could not be published",
                  );
                }
              } catch (e) {
                if ((e as DOMException).name === "NotAllowedError") {
                  logger.error(
                    "Fatal error while syncing mute state: resetting",
                    e,
                  );
                  if (type === MuteDevice.Microphone) {
                    muteStates.audio.setEnabled?.(false);
                  } else {
                    muteStates.video.setEnabled?.(false);
                  }
                } else {
                  logger.error(
                    "Failed to sync audio mute state with LiveKit (will retry to sync in 1s):",
                    e,
                  );
                  setTimeout(() => {
                    this.updatingMuteStates$.next(false);
                  }, 1000);
                }
              }
            }
          };

          syncMuteState(0, MuteDevice.Microphone).catch((e) => {
            logger.error("Failed to sync audio mute state with LiveKit", e);
          });
          syncMuteState(0, MuteDevice.Camera).catch((e) => {
            logger.error("Failed to sync video mute state with LiveKit", e);
          });
        }
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
  // TODO-MULTI-SFU Sync the requested track processors with LiveKit
}
