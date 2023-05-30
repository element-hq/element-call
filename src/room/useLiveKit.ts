import { LocalAudioTrack, LocalVideoTrack, Room } from "livekit-client";
import React from "react";
import { useMediaDevices, usePreviewDevice } from "@livekit/components-react";

import { MediaDevicesState, MediaDevices } from "../settings/mediaDevices";
import { LocalMediaInfo, MediaInfo } from "./VideoPreview";

type LiveKitState = {
  mediaDevices: MediaDevicesState;
  localMedia: LocalMediaInfo;

  enterRoom: () => Promise<void>;
  leaveRoom: () => Promise<void>;
};

// Returns the React state for the LiveKit's Room class.
// The actual return type should be `LiveKitState`, but since this is a React hook, the initialisation is
// delayed (done after the rendering, not during the rendering), because of that this function may return `undefined`.
// But soon this state is changed to the actual `LiveKitState` value.
export function useLiveKit(
  url: string,
  token: string
): LiveKitState | undefined {
  // TODO: Pass the proper paramters to configure the room (supported codecs, simulcast, adaptive streaming, etc).
  const [room] = React.useState<Room>(() => {
    return new Room();
  });

  // Create a React state to store the available devices and the selected device for each kind.
  const mediaDevices = useMediaDevicesState(room);

  // Create local video track.
  const [videoEnabled, setVideoEnabled] = React.useState<boolean>(true);
  const selectedVideoId = mediaDevices.state.get("videoinput")?.selectedId;
  const video = usePreviewDevice(
    videoEnabled,
    selectedVideoId ?? "",
    "videoinput"
  );

  // Create local audio track.
  const [audioEnabled, setAudioEnabled] = React.useState<boolean>(true);
  const selectedAudioId = mediaDevices.state.get("audioinput")?.selectedId;
  const audio = usePreviewDevice(
    audioEnabled,
    selectedAudioId ?? "",
    "audioinput"
  );

  // Create final LiveKit state.
  const [state, setState] = React.useState<LiveKitState | undefined>(undefined);
  React.useEffect(() => {
    // Helper to create local media without the copy-paste.
    const createLocalMedia = (
      track: LocalVideoTrack | LocalAudioTrack | undefined,
      enabled: boolean,
      setEnabled: React.Dispatch<React.SetStateAction<boolean>>
    ): MediaInfo | undefined => {
      if (!track) {
        return undefined;
      }

      return {
        track,
        muted: !enabled,
        toggle: async () => {
          setEnabled(!enabled);
        },
      };
    };

    const state: LiveKitState = {
      mediaDevices: mediaDevices,
      localMedia: {
        audio: createLocalMedia(
          audio.localTrack,
          audioEnabled,
          setAudioEnabled
        ),
        video: createLocalMedia(
          video.localTrack,
          videoEnabled,
          setVideoEnabled
        ),
      },
      enterRoom: async () => {
        // TODO: Pass connection parameters (autosubscribe, etc.).
        await room.connect(url, token);
      },
      leaveRoom: async () => {
        await room.disconnect();
      },
    };

    setState(state);
  }, [
    url,
    token,
    mediaDevices,
    audio.localTrack,
    video.localTrack,
    audioEnabled,
    videoEnabled,
    room,
  ]);

  return state;
}

function useMediaDevicesState(room: Room): MediaDevicesState {
  // Video input state.
  const videoInputDevices = useMediaDevices({ kind: "videoinput" });
  const [selectedVideoInput, setSelectedVideoInput] =
    React.useState<string>("");

  // Audio input state.
  const audioInputDevices = useMediaDevices({ kind: "audioinput" });
  const [selectedAudioInput, setSelectedAudioInput] =
    React.useState<string>("");

  // Audio output state.
  const audioOutputDevices = useMediaDevices({ kind: "audiooutput" });
  const [selectedAudioOut, setSelectedAudioOut] = React.useState<string>("");

  // Install hooks, so that we react to changes in the available devices.
  React.useEffect(() => {
    // Helper type to make the code more readable.
    type DeviceHookData = {
      kind: MediaDeviceKind;
      available: MediaDeviceInfo[];
      selected: string;
      setSelected: React.Dispatch<React.SetStateAction<string>>;
    };

    const videoInputHook: DeviceHookData = {
      kind: "videoinput",
      available: videoInputDevices,
      selected: selectedVideoInput,
      setSelected: setSelectedVideoInput,
    };

    const audioInputHook: DeviceHookData = {
      kind: "audioinput",
      available: audioInputDevices,
      selected: selectedAudioInput,
      setSelected: setSelectedAudioInput,
    };

    const audioOutputHook: DeviceHookData = {
      kind: "audiooutput",
      available: audioOutputDevices,
      selected: selectedAudioOut,
      setSelected: setSelectedAudioOut,
    };

    const updateDevice = async (kind: MediaDeviceKind, id: string) => {
      try {
        await room.switchActiveDevice(kind, id);
      } catch (e) {
        console.error("Failed to switch device", e);
      }
    };

    for (const hook of [videoInputHook, audioInputHook, audioOutputHook]) {
      if (hook.available.length === 0) {
        const newSelected = "";
        hook.setSelected(newSelected);
        updateDevice(hook.kind, newSelected);
        continue;
      }

      const found = hook.available.find(
        (device) => device.deviceId === hook.selected
      );

      if (!found) {
        const newSelected = hook.available[0].deviceId;
        hook.setSelected(newSelected);
        updateDevice(hook.kind, newSelected);
        continue;
      }
    }
  }, [
    videoInputDevices,
    selectedVideoInput,
    audioInputDevices,
    selectedAudioInput,
    audioOutputDevices,
    selectedAudioOut,
    room,
  ]);

  const selectActiveDevice = async (kind: MediaDeviceKind, id: string) => {
    switch (kind) {
      case "audioinput":
        setSelectedAudioInput(id);
        break;
      case "videoinput":
        setSelectedVideoInput(id);
        break;
      case "audiooutput":
        setSelectedAudioOut(id);
        break;
    }
  };

  const [mediaDevicesState, setMediaDevicesState] =
    React.useState<MediaDevicesState>(() => {
      const state: MediaDevicesState = {
        state: new Map(),
        selectActiveDevice,
      };
      return state;
    });

  React.useEffect(() => {
    // Fill the map of the devices with the current state.
    const mediaDevices = new Map<MediaDeviceKind, MediaDevices>();
    mediaDevices.set("audioinput", {
      available: audioInputDevices,
      selectedId: selectedAudioInput,
    });
    mediaDevices.set("videoinput", {
      available: videoInputDevices,
      selectedId: selectedVideoInput,
    });
    mediaDevices.set("audiooutput", {
      available: audioOutputDevices,
      selectedId: selectedAudioOut,
    });

    if (devicesChanged(mediaDevicesState.state, mediaDevices)) {
      const newState: MediaDevicesState = {
        state: mediaDevices,
        selectActiveDevice,
      };
      setMediaDevicesState(newState);
    }
  }, [
    audioInputDevices,
    selectedAudioInput,
    videoInputDevices,
    selectedVideoInput,
    audioOutputDevices,
    selectedAudioOut,
    mediaDevicesState.state,
  ]);

  return mediaDevicesState;
}

// Determine if any devices changed between the old and new state.
function devicesChanged(
  map1: Map<MediaDeviceKind, MediaDevices>,
  map2: Map<MediaDeviceKind, MediaDevices>
): boolean {
  if (map1.size !== map2.size) {
    return true;
  }

  for (const [key, value] of map1) {
    const newValue = map2.get(key);
    if (!newValue) {
      return true;
    }

    if (value.selectedId !== newValue.selectedId) {
      return true;
    }

    if (value.available.length !== newValue.available.length) {
      return true;
    }

    for (let i = 0; i < value.available.length; i++) {
      if (value.available[i].deviceId !== newValue.available[i].deviceId) {
        return true;
      }
    }
  }

  return false;
}
