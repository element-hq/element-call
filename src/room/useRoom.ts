import * as React from "react";
import {
  ConnectionState,
  MediaDeviceFailure,
  Room,
  RoomEvent,
} from "livekit-client";
import { LiveKitRoomProps } from "@livekit/components-react/src/components/LiveKitRoom";
import { logger } from "matrix-js-sdk/src/logger";

const defaultRoomProps: Partial<LiveKitRoomProps> = {
  connect: true,
  audio: false,
  video: false,
};

export function useRoom(props: LiveKitRoomProps) {
  const {
    token,
    serverUrl,
    options,
    room: passedRoom,
    connectOptions,
    connect,
    audio,
    video,
    screen,
    onConnected,
    onDisconnected,
    onError,
    onMediaDeviceFailure,
  } = { ...defaultRoomProps, ...props };
  if (options && passedRoom) {
    logger.warn(
      "when using a manually created room, the options object will be ignored. set the desired options directly when creating the room instead."
    );
  }

  const [room, setRoom] = React.useState<Room | undefined>();

  React.useEffect(() => {
    setRoom(passedRoom ?? new Room(options));
  }, [options, passedRoom]);

  React.useEffect(() => {
    if (!room) return;
    const onSignalConnected = () => {
      const localP = room.localParticipant;
      try {
        logger.debug("trying to publish local tracks");
        localP.setMicrophoneEnabled(
          !!audio,
          typeof audio !== "boolean" ? audio : undefined
        );
        localP.setCameraEnabled(
          !!video,
          typeof video !== "boolean" ? video : undefined
        );
        localP.setScreenShareEnabled(
          !!screen,
          typeof screen !== "boolean" ? screen : undefined
        );
      } catch (e) {
        logger.warn(e);
        onError?.(e as Error);
      }
    };

    const onMediaDeviceError = (e: Error) => {
      const mediaDeviceFailure = MediaDeviceFailure.getFailure(e);
      onMediaDeviceFailure?.(mediaDeviceFailure);
    };
    room.on(RoomEvent.SignalConnected, onSignalConnected);
    room.on(RoomEvent.MediaDevicesError, onMediaDeviceError);

    return () => {
      room.off(RoomEvent.SignalConnected, onSignalConnected);
      room.off(RoomEvent.MediaDevicesError, onMediaDeviceError);
    };
  }, [room, audio, video, screen, onError, onMediaDeviceFailure]);

  React.useEffect(() => {
    if (!room) return;
    if (!token) {
      logger.debug("no token yet");
      return;
    }
    if (!serverUrl) {
      logger.warn("no livekit url provided");
      onError?.(Error("no livekit url provided"));
      return;
    }
    if (connect) {
      logger.debug("connecting");
      room.connect(serverUrl, token, connectOptions).catch((e) => {
        logger.warn(e);
        onError?.(e as Error);
      });
    } else {
      logger.debug("disconnecting because connect is false");
      room.disconnect();
    }
  }, [connect, token, connectOptions, room, onError, serverUrl]);

  React.useEffect(() => {
    if (!room) return;
    const connectionStateChangeListener = (state: ConnectionState) => {
      switch (state) {
        case ConnectionState.Disconnected:
          if (onDisconnected) onDisconnected();
          break;
        case ConnectionState.Connected:
          if (onConnected) onConnected();
          break;

        default:
          break;
      }
    };
    room.on(RoomEvent.ConnectionStateChanged, connectionStateChangeListener);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, connectionStateChangeListener);
    };
  }, [token, onConnected, onDisconnected, room]);

  React.useEffect(() => {
    if (!room) return;
    return () => {
      logger.info("disconnecting on onmount");
      room.disconnect();
    };
  }, [room]);

  return { room };
}
