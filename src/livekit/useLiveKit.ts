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
  E2EEOptions,
  ExternalE2EEKeyProvider,
  Room,
  RoomOptions,
  setLogLevel,
} from "livekit-client";
import { useLiveKitRoom } from "@livekit/components-react";
import { useEffect, useMemo, useRef } from "react";
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

export type E2EEConfig = {
  sharedKey: string;
};

setLogLevel("debug");

export function useLiveKit(
  muteStates: MuteStates,
  sfuConfig?: SFUConfig,
  e2eeConfig?: E2EEConfig
): Room | undefined {
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

  // We have to create the room manually here due to a bug inside
  // @livekit/components-react. JSON.stringify() is used in deps of a
  // useEffect() with an argument that references itself, if E2EE is enabled
  const roomWithoutProps = useMemo(() => new Room(roomOptions), [roomOptions]);
  const { room } = useLiveKitRoom({
    token: sfuConfig?.jwt,
    serverUrl: sfuConfig?.url,
    audio: initialMuteStates.current.audio.enabled,
    video: initialMuteStates.current.video.enabled,
    room: roomWithoutProps,
  });

  useEffect(() => {
    // Sync the requested mute states with LiveKit's mute states. We do it this
    // way around rather than using LiveKit as the source of truth, so that the
    // states can be consistent throughout the lobby and loading screens.
    if (room !== undefined) {
      const participant = room.localParticipant;
      if (participant.isMicrophoneEnabled !== muteStates.audio.enabled) {
        participant
          .setMicrophoneEnabled(muteStates.audio.enabled)
          .catch((e) =>
            logger.error("Failed to sync audio mute state with LiveKit", e)
          );
      }
      if (participant.isCameraEnabled !== muteStates.video.enabled) {
        participant
          .setCameraEnabled(muteStates.video.enabled)
          .catch((e) =>
            logger.error("Failed to sync video mute state with LiveKit", e)
          );
      }
    }
  }, [room, muteStates]);

  useEffect(() => {
    // Sync the requested devices with LiveKit's devices
    if (room !== undefined) {
      const syncDevice = (kind: MediaDeviceKind, device: MediaDevice) => {
        const id = device.selectedId;
        if (id !== undefined && room.getActiveDevice(kind) !== id) {
          room
            .switchActiveDevice(kind, id)
            .catch((e) =>
              logger.error(`Failed to sync ${kind} device with LiveKit`, e)
            );
        }
      };

      syncDevice("audioinput", devices.audioInput);
      syncDevice("audiooutput", devices.audioOutput);
      syncDevice("videoinput", devices.videoInput);
    }
  }, [room, devices]);

  return room;
}
