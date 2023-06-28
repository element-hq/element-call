import { Room } from "livekit-client";
import {
  useMediaAllDevicesSelect,
  MediaDevicesSelection,
} from "@livekit/components-react";
import { useEffect } from "react";

import { useDefaultDevices } from "../settings/useSetting";

// if a room is passed this only affects the device selection inside a call. Without room it changes what we see in the lobby
export function useMediaAllDevicesWithLocalStorage(
  room?: Room
): MediaDevicesSelection {
  // This is a wrapper of useMediaAllDevicesSelect which stores the selecteded devices in the local stora when they change.
  const [settingsDefaultDevices, setSettingsDefaultDevices] =
    useDefaultDevices();

  const mediaDevices = useMediaAllDevicesSelect({
    room,
    audio: settingsDefaultDevices.audioinput,
    video: settingsDefaultDevices.videoinput,
    audioOut: settingsDefaultDevices.audiooutput,
  });

  const { audioIn, audioOut, videoIn } = mediaDevices;

  useEffect(() => {
    setSettingsDefaultDevices({
      audioinput:
        audioIn.selectedId != ""
          ? audioIn.selectedId
          : settingsDefaultDevices.audioinput,
      videoinput:
        videoIn.selectedId != ""
          ? videoIn.selectedId
          : settingsDefaultDevices.videoinput,
      audiooutput:
        audioOut.selectedId != ""
          ? audioOut.selectedId
          : settingsDefaultDevices.audiooutput,
    });
  }, [
    audioIn.selectedId,
    videoIn.selectedId,
    audioOut.selectedId,
    settingsDefaultDevices.audioinput,
    settingsDefaultDevices.audiooutput,
    settingsDefaultDevices.videoinput,
    setSettingsDefaultDevices,
  ]);

  return mediaDevices;
}
