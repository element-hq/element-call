import { SetMediaDeviceOptions } from "@livekit/components-core";
import React, { SetStateAction, useEffect, useState } from "react";
import { useMediaDeviceSelect } from "@livekit/components-react";
import {
  ConnectionState,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
} from "livekit-client";

import { useDefaultDevices } from "../settings/useSetting";

export interface LocalUserChoices {
  activeVideoDeviceId: string;
  activeAudioDeviceId: string;
  activeAudioOutputDeviceId: string;
  setActiveVideoDevice: (
    id: string,
    options?: SetMediaDeviceOptions
  ) => Promise<void>;
  setActiveAudioDevice: (
    id: string,
    options?: SetMediaDeviceOptions
  ) => Promise<void>;
  setActiveAudioOutputDevice: (
    id: string,
    options?: SetMediaDeviceOptions
  ) => Promise<void>;

  videoEnabled: boolean;
  audioEnabled: boolean;
  setVideoEnabled: React.Dispatch<SetStateAction<boolean>>;
  setAudioEnabled: React.Dispatch<SetStateAction<boolean>>;
}
export interface LocalMediaTracks {
  video: LocalVideoTrack | LocalAudioTrack;
  audio: LocalVideoTrack | LocalAudioTrack;
}
export interface MediaDevicesList {
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
}

type DeviceChoices = {
  userChoices: LocalUserChoices;

  mediaDevices: MediaDevicesList;
};

export function emptyToUndefined(str) {
  return str === "" ? undefined : str;
}

// Returns the React state for the LiveKit's Room class.
// The actual return type should be `LiveKitState`, but since this is a React hook, the initialisation is
// delayed (done after the rendering, not during the rendering), because of that this function may return `undefined`.
// But soon this state is changed to the actual `LiveKitState` value.
export function useMediaDevicesChoices(room: Room): DeviceChoices | undefined {
  const connectedRoom =
    room.state === ConnectionState.Connected ? room : undefined;
  const {
    devices: videoDevices,
    activeDeviceId: activeVideoDeviceId,
    setActiveMediaDevice: setActiveVideoDevice,
  } = useMediaDeviceSelect({ kind: "videoinput", room: connectedRoom });
  const {
    devices: audioDevices,
    activeDeviceId: activeAudioDeviceId,
    setActiveMediaDevice: setActiveAudioDevice,
  } = useMediaDeviceSelect({
    kind: "audioinput",
    room: connectedRoom,
  });
  const {
    devices: audioOutputDevices,
    activeDeviceId: activeAudioOutputDeviceId,
    setActiveMediaDevice: setActiveAudioOutputDevice,
  } = useMediaDeviceSelect({
    kind: "audiooutput",
    room: connectedRoom,
  });
  // update the settings inside an effect whenever the mediaDevicesChange
  const [settingsDefaultDevices, setSettingsDefaultDevices] =
    useDefaultDevices();

  useEffect(() => {
    setSettingsDefaultDevices({
      audioinput:
        emptyToUndefined(activeAudioDeviceId) ??
        settingsDefaultDevices.audioinput,
      videoinput:
        emptyToUndefined(activeVideoDeviceId) ??
        settingsDefaultDevices.videoinput,
      audiooutput:
        emptyToUndefined(activeAudioOutputDeviceId) ??
        settingsDefaultDevices.audiooutput,
    });
  }, [
    activeAudioDeviceId,
    activeAudioOutputDeviceId,
    activeVideoDeviceId,
    setSettingsDefaultDevices,
    settingsDefaultDevices.audioinput,
    settingsDefaultDevices.audiooutput,
    settingsDefaultDevices.videoinput,
  ]);

  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);

  return {
    mediaDevices: {
      videoDevices,
      audioDevices,
      audioOutputDevices,
    },

    userChoices: {
      activeVideoDeviceId:
        emptyToUndefined(activeVideoDeviceId) ??
        settingsDefaultDevices.videoinput,
      activeAudioDeviceId:
        emptyToUndefined(activeAudioDeviceId) ??
        settingsDefaultDevices.audioinput,
      activeAudioOutputDeviceId,
      setActiveVideoDevice,
      setActiveAudioDevice,
      setActiveAudioOutputDevice,

      videoEnabled,
      audioEnabled,
      setVideoEnabled,
      setAudioEnabled,
    },
  };
}
