import { EventEmitter } from "events";
import { Room, RoomEvent, Track } from "livekit-client";
import React from "react";
import { useLocalParticipant } from "@livekit/components-react";

import {
  MediaDeviceHandlerCallbacks,
  MediaDeviceHandlerEvents,
  MediaDevicesManager,
} from "./devices/mediaDevices";
import { MediaDevicesState, useMediaDevices } from "./devices/useMediaDevices";
import { LocalMediaInfo, MediaInfo } from "./VideoPreview";
import type TypedEmitter from "typed-emitter";

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

  const [mediaDevicesManager] = React.useState<MediaDevicesManager>(() => {
    return new LkMediaDevicesManager(room);
  });

  const { state: mediaDevicesState, selectActiveDevice: selectDeviceFn } =
    useMediaDevices(mediaDevicesManager);

  React.useEffect(() => {
    console.log("media devices changed, mediaDevices:", mediaDevicesState);
  }, [mediaDevicesState]);

  const {
    microphoneTrack,
    isMicrophoneEnabled,
    cameraTrack,
    isCameraEnabled,
    localParticipant,
  } = useLocalParticipant({ room });

  const [state, setState] = React.useState<LiveKitState | undefined>(undefined);
  React.useEffect(() => {
    // Helper to create local media without the
    const createLocalMedia = (
      enabled: boolean,
      track: Track | undefined,
      setEnabled
    ): MediaInfo | undefined => {
      if (!track) {
        return undefined;
      }

      return {
        track,
        muted: !enabled,
        setMuted: async (newState: boolean) => {
          if (enabled != newState) {
            await setEnabled(newState);
          }
        },
      };
    };

    const state: LiveKitState = {
      mediaDevices: {
        state: mediaDevicesState,
        selectActiveDevice: selectDeviceFn,
      },
      localMedia: {
        audio: createLocalMedia(
          isMicrophoneEnabled,
          microphoneTrack?.track,
          localParticipant.setMicrophoneEnabled
        ),
        video: createLocalMedia(
          isCameraEnabled,
          cameraTrack?.track,
          localParticipant.setCameraEnabled
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
    room,
    mediaDevicesState,
    selectDeviceFn,
    localParticipant,
    microphoneTrack,
    cameraTrack,
    isMicrophoneEnabled,
    isCameraEnabled,
  ]);

  return state;
}

// Implement the MediaDevicesHandler interface for the LiveKit's Room class by wrapping it, so that
// we can pass the confined version of the `Room` to the `MediaDevicesHandler` consumers.
export class LkMediaDevicesManager
  extends (EventEmitter as new () => TypedEmitter<MediaDeviceHandlerCallbacks>)
  implements MediaDevicesManager
{
  private room: Room;

  constructor(room: Room) {
    super();
    this.room = room;

    this.room.on(RoomEvent.MediaDevicesChanged, () => {
      this.emit(MediaDeviceHandlerEvents.DevicesChanged);
    });
  }

  async getDevices(kind: MediaDeviceKind) {
    return await Room.getLocalDevices(kind);
  }

  async setActiveDevice(kind: MediaDeviceKind, deviceId: string) {
    await this.room.switchActiveDevice(kind, deviceId);
  }
}
