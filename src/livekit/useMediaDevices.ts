import { useMediaDeviceSelect } from "@livekit/components-react";
import { Room } from "livekit-client";

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
export function useMediaDevices(room?: Room): MediaDevicesState {
  const {
    devices: videoDevices,
    activeDeviceId: activeVideoDevice,
    setActiveMediaDevice: setActiveVideoDevice,
  } = useMediaDeviceSelect({ kind: "videoinput", room });

  const {
    devices: audioDevices,
    activeDeviceId: activeAudioDevice,
    setActiveMediaDevice: setActiveAudioDevice,
  } = useMediaDeviceSelect({
    kind: "audioinput",
    room,
  });

  const {
    devices: audioOutputDevices,
    activeDeviceId: activeAudioOutputDevice,
    setActiveMediaDevice: setActiveAudioOutputDevice,
  } = useMediaDeviceSelect({
    kind: "audiooutput",
    room,
  });

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
