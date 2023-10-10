/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {
  ConnectionState,
  E2EEOptions,
  ExternalE2EEKeyProvider,
  Room,
  RoomOptions,
  Track,
} from "livekit-client";
import { useLiveKitRoom } from "@livekit/components-react";
import { useEffect, useMemo, useRef, useState } from "react";
import E2EEWorker from "livekit-client/e2ee-worker?worker";
import { logger } from "matrix-js-sdk/src/logger";

import { defaultLiveKitOptions } from "./options";
import { SFUConfig } from "./openIDSFU";
import { MuteStates } from "../room/MuteStates";
import {
  MediaDevice,
  MediaDevices,
  useMediaDevices,
} from "./MediaDevicesContext";
import {
  ECConnectionState,
  useECConnectionState,
} from "./useECConnectionState";

export type E2EEConfig = {
  sharedKey: string;
};

interface UseLivekitResult {
  livekitRoom?: Room;
  connState: ECConnectionState;
}

export function useLiveKit(
  muteStates: MuteStates,
  sfuConfig?: SFUConfig,
  e2eeConfig?: E2EEConfig
): UseLivekitResult {
  const e2eeOptions = useMemo(() => {
    if (!e2eeConfig?.sharedKey) return undefined;

    return {
      keyProvider: new ExternalE2EEKeyProvider(),
      worker: new E2EEWorker(),
    } as E2EEOptions;
  }, [e2eeConfig]);

  useEffect(() => {
    if (!e2eeConfig?.sharedKey || !e2eeOptions) return;

    (e2eeOptions.keyProvider as ExternalE2EEKeyProvider).setKey(
      e2eeConfig?.sharedKey
    );
  }, [e2eeOptions, e2eeConfig?.sharedKey]);

  const initialMuteStates = useRef<MuteStates>(muteStates);
  const devices = useMediaDevices();
  const initialDevices = useRef<MediaDevices>(devices);

  const roomOptions = useMemo(
    (): RoomOptions => ({
      ...defaultLiveKitOptions,
      videoCaptureDefaults: {
        ...defaultLiveKitOptions.videoCaptureDefaults,
        deviceId: initialDevices.current.videoInput.selectedId,
      },
      audioCaptureDefaults: {
        ...defaultLiveKitOptions.audioCaptureDefaults,
        deviceId: initialDevices.current.audioInput.selectedId,
      },
      // XXX Setting the audio output here doesn't seem to do anything… a bug in
      // LiveKit?
      audioOutput: {
        deviceId: initialDevices.current.audioOutput.selectedId,
      },
      e2ee: e2eeOptions,
    }),
    [e2eeOptions]
  );

  // useECConnectionState creates and publishes an audio track by hand. To keep
  // this from racing with LiveKit's automatic creation of the audio track, we
  // block audio from being enabled until the connection is finished.
  const [blockAudio, setBlockAudio] = useState(true);

  // Store if audio/video are currently updating. If to prohibit unnecessary calls
  // to setMicrophoneEnabled/setCameraEnabled
  const [audioMuteUpdating, setAudioMuteUpdating] = useState(false);
  const [videoMuteUpdating, setVideoMuteUpdating] = useState(false);

  // We have to create the room manually here due to a bug inside
  // @livekit/components-react. JSON.stringify() is used in deps of a
  // useEffect() with an argument that references itself, if E2EE is enabled
  const roomWithoutProps = useMemo(() => new Room(roomOptions), [roomOptions]);
  const { room } = useLiveKitRoom({
    token: sfuConfig?.jwt,
    serverUrl: sfuConfig?.url,
    audio: initialMuteStates.current.audio.enabled && !blockAudio,
    video: initialMuteStates.current.video.enabled,
    room: roomWithoutProps,
    connect: false,
  });

  const connectionState = useECConnectionState(
    {
      deviceId: initialDevices.current.audioOutput.selectedId,
    },
    initialMuteStates.current.audio.enabled,
    room,
    sfuConfig
  );

  // Unblock audio once the connection is finished
  useEffect(() => {
    if (connectionState === ConnectionState.Connected) setBlockAudio(false);
  }, [connectionState, setBlockAudio]);

  useEffect(() => {
    // Sync the requested mute states with LiveKit's mute states. We do it this
    // way around rather than using LiveKit as the source of truth, so that the
    // states can be consistent throughout the lobby and loading screens.
    // It's important that we only do this in the connected state, because
    // LiveKit's internal mute states aren't consistent during connection setup,
    // and setting tracks to be enabled during this time causes errors.
    if (room !== undefined && connectionState === ConnectionState.Connected) {
      const participant = room.localParticipant;

      const syncMuteStateAudio = () => {
        if (
          participant.isMicrophoneEnabled !== muteStates.audio.enabled &&
          !audioMuteUpdating
        ) {
          setAudioMuteUpdating(true);
          participant
            .setMicrophoneEnabled(muteStates.audio.enabled)
            .catch((e) =>
              logger.error("Failed to sync audio mute state with LiveKit", e)
            )
            // Run the check again after the change is done. Because the user
            // can update the state (presses mute button) while the device is enabling
            // itself we need might need to update the mute state right away.
            // This async recursion makes sure that setCamera/MicrophoneEnabled is
            // called as little times as possible.
            .then(() => {
              setAudioMuteUpdating(false);
              syncMuteStateAudio();
            });
        }
      };
      const syncMuteStateVideo = () => {
        if (
          participant.isCameraEnabled !== muteStates.video.enabled &&
          !videoMuteUpdating
        ) {
          setVideoMuteUpdating(true);
          participant
            .setCameraEnabled(muteStates.video.enabled)
            .catch((e) =>
              logger.error("Failed to sync video mute state with LiveKit", e)
            )
            // see above
            .then(() => {
              setVideoMuteUpdating(false);
              syncMuteStateVideo();
            });
        }
      };
      syncMuteStateAudio();
      syncMuteStateVideo();
    }
  }, [room, muteStates, connectionState, audioMuteUpdating, videoMuteUpdating]);

  useEffect(() => {
    // Sync the requested devices with LiveKit's devices
    if (room !== undefined && connectionState === ConnectionState.Connected) {
      const syncDevice = (kind: MediaDeviceKind, device: MediaDevice) => {
        const id = device.selectedId;

        // Detect if we're trying to use chrome's default device, in which case
        // we need to to see if the default device has changed to a different device
        // by comparing the group ID of the device we're using against the group ID
        // of what the default device is *now*.
        // This is special-cased for only audio inputs because we need to dig around
        // in the LocalParticipant object for the track object and there's not a nice
        // way to do that generically. There is usually no OS-level default video capture
        // device anyway, and audio outputs work differently.
        if (
          id === "default" &&
          kind === "audioinput" &&
          room.options.audioCaptureDefaults?.deviceId === "default"
        ) {
          const activeMicTrack = Array.from(
            room.localParticipant.audioTracks.values()
          ).find((d) => d.source === Track.Source.Microphone)?.track;

          const defaultDevice = device.available.find(
            (d) => d.deviceId === "default"
          );
          if (
            defaultDevice &&
            activeMicTrack &&
            // only restart if the stream is still running: LiveKit will detect
            // when a track stops & restart appropriately, so this is not our job.
            // Plus, we need to avoid restarting again if the track is already in
            // the process of being restarted.
            activeMicTrack.mediaStreamTrack.readyState !== "ended" &&
            defaultDevice.groupId !==
              activeMicTrack.mediaStreamTrack.getSettings().groupId
          ) {
            // It's different, so restart the track, ie. cause Livekit to do another
            // getUserMedia() call with deviceId: default to get the *new* default device.
            // Note that room.switchActiveDevice() won't work: Livekit will ignore it because
            // the deviceId hasn't changed (was & still is default).
            room.localParticipant
              .getTrack(Track.Source.Microphone)
              ?.audioTrack?.restartTrack();
          }
        } else {
          if (id !== undefined && room.getActiveDevice(kind) !== id) {
            room
              .switchActiveDevice(kind, id)
              .catch((e) =>
                logger.error(`Failed to sync ${kind} device with LiveKit`, e)
              );
          }
        }
      };

      syncDevice("audioinput", devices.audioInput);
      syncDevice("audiooutput", devices.audioOutput);
      syncDevice("videoinput", devices.videoInput);
    }
  }, [room, devices, connectionState]);

  return {
    connState: connectionState,
    livekitRoom: room,
  };
}
