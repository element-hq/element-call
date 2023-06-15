import {
  ConnectionState,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
} from "livekit-client";
import React from "react";
import {
  useMediaDeviceSelect,
  usePreviewDevice,
} from "@livekit/components-react";

import { MediaDevicesState, MediaDevices } from "../settings/mediaDevices";
import { LocalMediaInfo, MediaInfo } from "../room/VideoPreview";
import { roomOptions } from "./options";
import { useDefaultDevices } from "../settings/useSetting";

type LiveKitState = {
  // The state of the media devices (changing the devices will also change them in the room).
  mediaDevices: MediaDevicesState;
  // The local media (audio and video) that can be referenced in an e.g. lobby view.
  localMedia: LocalMediaInfo;
  // A reference to the newly constructed (but not yet entered) room for future use with the LiveKit hooks.
  // TODO: Abstract this away, so that the user doesn't have to deal with the LiveKit room directly.
  room: Room;
};

function emptyToUndef(str) {
  return str === "" ? undefined : str;
}

// Returns the React state for the LiveKit's Room class.
// The actual return type should be `LiveKitState`, but since this is a React hook, the initialisation is
// delayed (done after the rendering, not during the rendering), because of that this function may return `undefined`.
// But soon this state is changed to the actual `LiveKitState` value.
export function useLiveKit(): LiveKitState | undefined {
  // TODO: Pass the proper paramters to configure the room (supported codecs, simulcast, adaptive streaming, etc).
  const [room] = React.useState<Room>(() => {
    return new Room(roomOptions);
  });

  // Create a React state to store the available devices and the selected device for each kind.
  const mediaDevices = useMediaDevicesState(room);

  const [settingsDefaultDevices] = useDefaultDevices();

  const [videoEnabled, setVideoEnabled] = React.useState<boolean>(true);
  const selectedVideoId = mediaDevices.state.get("videoinput")?.selectedId;

  const [audioEnabled, setAudioEnabled] = React.useState<boolean>(true);
  const selectedAudioId = mediaDevices.state.get("audioinput")?.selectedId;

  // trigger permission popup first,
  // useEffect(() => {
  //   navigator.mediaDevices.getUserMedia({
  //     video: { deviceId: selectedVideoId ?? settingsDefaultDevices.videoinput },
  //     audio: { deviceId: selectedAudioId ?? settingsDefaultDevices.audioinput },
  //   });
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  // then start the preview device (no permission should be triggered agian)
  // Create local video track.
  const video = usePreviewDevice(
    videoEnabled,
    selectedVideoId ?? settingsDefaultDevices.videoinput,
    "videoinput"
  );

  // Create local audio track.
  const audio = usePreviewDevice(
    audioEnabled,
    selectedAudioId ?? settingsDefaultDevices.audioinput,
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
      room,
    };

    setState(state);
  }, [
    mediaDevices,
    audio.localTrack,
    video.localTrack,
    audioEnabled,
    videoEnabled,
    room,
  ]);

  return state;
}

// if a room is passed this only affects the device selection inside a call. Without room it changes what we see in the lobby
function useMediaDevicesState(room: Room): MediaDevicesState {
  let connectedRoom: Room;
  if (room.state !== ConnectionState.Disconnected) {
    connectedRoom = room;
  }
  const {
    devices: videoDevices,
    activeDeviceId: activeVideoDevice,
    setActiveMediaDevice: setActiveVideoDevice,
  } = useMediaDeviceSelect({ kind: "videoinput", room: connectedRoom });
  const {
    devices: audioDevices,
    activeDeviceId: activeAudioDevice,
    setActiveMediaDevice: setActiveAudioDevice,
  } = useMediaDeviceSelect({
    kind: "audioinput",
    room: connectedRoom,
  });
  const {
    devices: audioOutputDevices,
    activeDeviceId: activeAudioOutputDevice,
    setActiveMediaDevice: setActiveAudioOutputDevice,
  } = useMediaDeviceSelect({
    kind: "audiooutput",
    room: connectedRoom,
  });

  const selectActiveDevice = React.useCallback(
    async (kind: MediaDeviceKind, id: string) => {
      switch (kind) {
        case "audioinput":
          setActiveAudioDevice(id);
          break;
        case "videoinput":
          setActiveVideoDevice(id);
          break;
        case "audiooutput":
          setActiveAudioOutputDevice(id);
          break;
      }
    },
    [setActiveVideoDevice, setActiveAudioOutputDevice, setActiveAudioDevice]
  );

  const [mediaDevicesState, setMediaDevicesState] =
    React.useState<MediaDevicesState>(() => {
      const state: MediaDevicesState = {
        state: new Map(),
        selectActiveDevice,
      };
      return state;
    });

  const [settingsDefaultDevices, setDefaultDevices] = useDefaultDevices();

  React.useEffect(() => {
    const state = new Map<MediaDeviceKind, MediaDevices>();
    state.set("videoinput", {
      available: videoDevices,
      selectedId:
        emptyToUndef(activeVideoDevice) ??
        emptyToUndef(settingsDefaultDevices.videoinput) ??
        videoDevices[0]?.deviceId,
    });
    state.set("audioinput", {
      available: audioDevices,
      selectedId:
        emptyToUndef(activeAudioDevice) ??
        emptyToUndef(settingsDefaultDevices.audioinput) ??
        audioDevices[0]?.deviceId,
    });
    state.set("audiooutput", {
      available: audioOutputDevices,
      selectedId:
        emptyToUndef(activeAudioOutputDevice) ??
        emptyToUndef(settingsDefaultDevices.audiooutput) ??
        audioOutputDevices[0]?.deviceId,
    });
    setDefaultDevices({
      audioinput: state.get("audioinput").selectedId,
      videoinput: state.get("videoinput").selectedId,
      audiooutput: state.get("audiooutput").selectedId,
    });
    setMediaDevicesState({
      state,
      selectActiveDevice,
    });
  }, [
    videoDevices,
    activeVideoDevice,
    audioDevices,
    activeAudioDevice,
    audioOutputDevices,
    activeAudioOutputDevice,
    selectActiveDevice,
    setDefaultDevices,
    settingsDefaultDevices.audioinput,
    settingsDefaultDevices.videoinput,
    settingsDefaultDevices.audiooutput,
  ]);

  return mediaDevicesState;
}
