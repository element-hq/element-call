import { Room, RoomOptions } from "livekit-client";
import { useLiveKitRoom } from "@livekit/components-react";
import React from "react";

import { defaultLiveKitOptions } from "./options";
import { SFUConfig } from "./openIDSFU";

export type UserChoices = {
  audio?: DeviceChoices;
  video?: DeviceChoices;
};

export type DeviceChoices = {
  selectedId: string;
  enabled: boolean;
};

export function useLiveKit(
  userChoices: UserChoices,
  sfuConfig: SFUConfig
): Room | undefined {
  const roomOptions = React.useMemo((): RoomOptions => {
    const options = defaultLiveKitOptions;
    options.videoCaptureDefaults = {
      ...options.videoCaptureDefaults,
      deviceId: userChoices.video?.selectedId,
    };
    options.audioCaptureDefaults = {
      ...options.audioCaptureDefaults,
      deviceId: userChoices.audio?.selectedId,
    };
    return options;
  }, [userChoices.video, userChoices.audio]);

  const { room } = useLiveKitRoom({
    token: sfuConfig.jwt,
    serverUrl: sfuConfig.url,
    audio: userChoices.audio?.enabled ?? false,
    video: userChoices.video?.enabled ?? false,
    options: roomOptions,
  });

  return room;
}
