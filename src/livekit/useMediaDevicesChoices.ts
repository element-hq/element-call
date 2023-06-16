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

  const finalVal = {
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
  return finalVal;
  // React.useEffect(() => {
  //   // Helper to create local media without the copy-paste.
  //   const createLocalMedia = (
  //     track: LocalVideoTrack | LocalAudioTrack | undefined,
  //     enabled: boolean,
  //     setEnabled: React.Dispatch<React.SetStateAction<boolean>>
  //   ): MediaInfo | undefined => {
  //     if (!track) {
  //       return undefined;
  //     }

  //     return {
  //       track,
  //       muted: !enabled,
  //       toggle: async () => {
  //         setEnabled(!enabled);
  //       },
  //     };
  //   };
  //   const state: LiveKitState = {
  //     mediaDevices: mediaDevices,
  //     localMedia: {
  //       audio: createLocalMedia(
  //         audio.localTrack,
  //         audioEnabled,
  //         setAudioEnabled
  //       ),
  //       video: createLocalMedia(
  //         video.localTrack,
  //         videoEnabled,
  //         setVideoEnabled
  //       ),
  //     },
  //     room,
  //   };

  //   setState(state);
  // }, [
  //   mediaDevices,
  //   audio.localTrack,
  //   video.localTrack,
  //   audioEnabled,
  //   videoEnabled,
  //   room,
  // ]);

  // return state;
}

// if a room is passed this only affects the device selection inside a call. Without room it changes what we see in the lobby
// function useMediaDevicesState(room: Room): MediaDevicesState {
//   let connectedRoom: Room;
//   if (room.state !== ConnectionState.Disconnected) {
//     connectedRoom = room;
//   }
//   const {
//     devices: videoDevices,
//     activeDeviceId: activeVideoDevice,
//     setActiveMediaDevice: setActiveVideoDevice,
//   } = useMediaDeviceSelect({ kind: "videoinput", room: connectedRoom });
//   const {
//     devices: audioDevices,
//     activeDeviceId: activeAudioDevice,
//     setActiveMediaDevice: setActiveAudioDevice,
//   } = useMediaDeviceSelect({
//     kind: "audioinput",
//     room: connectedRoom,
//   });
//   const {
//     devices: audioOutputDevices,
//     activeDeviceId: activeAudioOutputDevice,
//     setActiveMediaDevice: setActiveAudioOutputDevice,
//   } = useMediaDeviceSelect({
//     kind: "audiooutput",
//     room: connectedRoom,
//   });

//   const selectActiveDevice = React.useCallback(
//     async (kind: MediaDeviceKind, id: string) => {
//       switch (kind) {
//         case "audioinput":
//           setActiveAudioDevice(id);
//           break;
//         case "videoinput":
//           setActiveVideoDevice(id);
//           break;
//         case "audiooutput":
//           setActiveAudioOutputDevice(id);
//           break;
//       }
//     },
//     [setActiveVideoDevice, setActiveAudioOutputDevice, setActiveAudioDevice]
//   );

//   const [mediaDevicesState, setMediaDevicesState] =
//     React.useState<MediaDevicesState>(() => {
//       const state: MediaDevicesState = {
//         state: new Map(),
//         selectActiveDevice,
//       };
//       return state;
//     });

//   const [settingsDefaultDevices, setDefaultDevices] = useDefaultDevices();

//   React.useEffect(() => {
//     const state = new Map<MediaDeviceKind, MediaDevices>();
//     state.set("videoinput", {
//       available: videoDevices,
//       selectedId:
//         emptyToUndef(activeVideoDevice) ??
//         emptyToUndef(settingsDefaultDevices.videoinput) ??
//         videoDevices[0]?.deviceId,
//     });
//     state.set("audioinput", {
//       available: audioDevices,
//       selectedId:
//         emptyToUndef(activeAudioDevice) ??
//         emptyToUndef(settingsDefaultDevices.audioinput) ??
//         audioDevices[0]?.deviceId,
//     });
//     state.set("audiooutput", {
//       available: audioOutputDevices,
//       selectedId:
//         emptyToUndef(activeAudioOutputDevice) ??
//         emptyToUndef(settingsDefaultDevices.audiooutput) ??
//         audioOutputDevices[0]?.deviceId,
//     });
//     setDefaultDevices({
//       audioinput: state.get("audioinput").selectedId,
//       videoinput: state.get("videoinput").selectedId,
//       audiooutput: state.get("audiooutput").selectedId,
//     });
//     setMediaDevicesState({
//       state,
//       selectActiveDevice,
//     });
//   }, [
//     videoDevices,
//     activeVideoDevice,
//     audioDevices,
//     activeAudioDevice,
//     audioOutputDevices,
//     activeAudioOutputDevice,
//     selectActiveDevice,
//     setDefaultDevices,
//     settingsDefaultDevices.audioinput,
//     settingsDefaultDevices.videoinput,
//     settingsDefaultDevices.audiooutput,
//   ]);

//   return mediaDevicesState;
// }
