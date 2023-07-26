import {
  E2EEOptions,
  ExternalE2EEKeyProvider,
  Room,
  RoomOptions,
  setLogLevel,
} from "livekit-client";
import { useLiveKitRoom } from "@livekit/components-react";
import { useEffect, useMemo } from "react";
import E2EEWorker from "livekit-client/e2ee-worker?worker";

import { defaultLiveKitOptions } from "./options";
import { SFUConfig } from "./openIDSFU";

export type UserChoices = {
  audio?: DeviceChoices;
  video?: DeviceChoices;
};

export type DeviceChoices = {
  selectedId?: string;
  enabled: boolean;
};

export type E2EEConfig = {
  sharedKey: string;
};

setLogLevel("debug");

export function useLiveKit(
  userChoices: UserChoices,
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

  const roomOptions = useMemo((): RoomOptions => {
    const options = defaultLiveKitOptions;
    options.videoCaptureDefaults = {
      ...options.videoCaptureDefaults,
      deviceId: userChoices.video?.selectedId,
    };
    options.audioCaptureDefaults = {
      ...options.audioCaptureDefaults,
      deviceId: userChoices.audio?.selectedId,
    };

    options.e2ee = e2eeOptions;

    return options;
  }, [userChoices.video, userChoices.audio, e2eeOptions]);

  // We have to create the room manually here due to a bug inside
  // @livekit/components-react. JSON.stringify() is used in deps of a
  // useEffect() with an argument that references itself, if E2EE is enabled
  const roomWithoutProps = useMemo(() => new Room(roomOptions), [roomOptions]);
  const { room } = useLiveKitRoom({
    token: sfuConfig?.jwt,
    serverUrl: sfuConfig?.url,
    audio: userChoices.audio?.enabled ?? false,
    video: userChoices.video?.enabled ?? false,
    room: roomWithoutProps,
  });

  return room;
}
