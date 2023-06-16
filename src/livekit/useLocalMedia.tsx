import {
  LocalAudioTrack,
  LocalVideoTrack,
  VideoPresets,
  createLocalTracks,
} from "livekit-client";
import { useEffect } from "react";
import { usePreviewDevice } from "@livekit/components-react";

import { LocalUserChoices } from "./useMediaDevicesChoices";

export interface LocalPrevieTracks {
  video: LocalVideoTrack | LocalAudioTrack;
  audio: LocalVideoTrack | LocalAudioTrack;
}

export function useLocalPreviewTracks(
  userChoices: LocalUserChoices
): LocalPrevieTracks | undefined {
  useEffect(() => {
    // This effect is run only once and triggers the permissions gui with a combined video and audio request
    // The usePreviewDevice hook will await until the permissions are granted so this does not break track creation inside usePreview
    // TODO: query if the permissions are already granted an skip this check (navigator.permissions.query({ name: "camera" }) is only available on chrome)

    const videoOptions = {
      deviceId: userChoices.activeVideoDeviceId,
      resolution: VideoPresets.h720.resolution,
    };
    const audioOptions = { deviceId: userChoices.activeAudioDeviceId };

    const createRequiredTracks = async () => {
      const createdTracks = await createLocalTracks({
        video: videoOptions,
        audio: audioOptions,
      });

      createdTracks.forEach((t) => t.stop());
    };

    createRequiredTracks();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const video = usePreviewDevice(
    userChoices.videoEnabled,
    userChoices.activeVideoDeviceId,
    "videoinput"
  );
  const audio = usePreviewDevice(
    userChoices.audioEnabled,
    userChoices.activeAudioDeviceId,
    "audioinput"
  );

  return {
    video: video?.localTrack,
    audio: audio?.localTrack,
  };
}
