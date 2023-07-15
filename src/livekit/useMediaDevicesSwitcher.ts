import { useMediaDeviceSelect } from "@livekit/components-react";
import { LocalAudioTrack, LocalVideoTrack, Room } from "livekit-client";
import { useEffect } from "react";

import { useDefaultDevices } from "../settings/useSetting";

export type MediaDevices = {
  available: MediaDeviceInfo[];
  selectedId: string;
  setSelected: (deviceId: string) => Promise<void>;
};

export type MediaDevicesState = {
  audioIn: MediaDevices;
  audioOut: MediaDevices;
  videoIn: MediaDevices;
};

// if a room is passed this only affects the device selection inside a call. Without room it changes what we see in the lobby
export function useMediaDevicesSwitcher(
  room?: Room,
  tracks?: { videoTrack?: LocalVideoTrack; audioTrack?: LocalAudioTrack },
  requestPermissions = true
): MediaDevicesState {
  const {
    devices: videoDevices,
    activeDeviceId: activeVideoDevice,
    setActiveMediaDevice: setActiveVideoDevice,
  } = useMediaDeviceSelect({
    kind: "videoinput",
    room,
    track: tracks?.videoTrack,
    requestPermissions,
  });

  const {
    devices: audioDevices,
    activeDeviceId: activeAudioDevice,
    setActiveMediaDevice: setActiveAudioDevice,
  } = useMediaDeviceSelect({
    kind: "audioinput",
    room,
    track: tracks?.audioTrack,
    requestPermissions,
  });

  const {
    devices: audioOutputDevices,
    activeDeviceId: activeAudioOutputDevice,
    setActiveMediaDevice: setActiveAudioOutputDevice,
  } = useMediaDeviceSelect({
    kind: "audiooutput",
    room,
  });

  const [settingsDefaultDevices, setSettingsDefaultDevices] =
    useDefaultDevices();

  useEffect(() => {
    setSettingsDefaultDevices({
      audioinput:
        activeAudioDevice != ""
          ? activeAudioDevice
          : settingsDefaultDevices.audioinput,
      videoinput:
        activeVideoDevice != ""
          ? activeVideoDevice
          : settingsDefaultDevices.videoinput,
      audiooutput:
        activeAudioOutputDevice != ""
          ? activeAudioOutputDevice
          : settingsDefaultDevices.audiooutput,
    });
  }, [
    activeAudioDevice,
    activeAudioOutputDevice,
    activeVideoDevice,
    setSettingsDefaultDevices,
    settingsDefaultDevices.audioinput,
    settingsDefaultDevices.audiooutput,
    settingsDefaultDevices.videoinput,
  ]);

  return {
    audioIn: {
      available: audioDevices,
      selectedId: activeAudioDevice,
      setSelected: setActiveAudioDevice,
    },
    audioOut: {
      available: audioOutputDevices,
      selectedId: activeAudioOutputDevice,
      setSelected: setActiveAudioOutputDevice,
    },
    videoIn: {
      available: videoDevices,
      selectedId: activeVideoDevice,
      setSelected: setActiveVideoDevice,
    },
  };
}
