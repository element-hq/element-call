import { log } from "@livekit/components-core";
import {
  VideoPresets,
  createLocalAudioTrack,
  createLocalVideoTrack,
} from "livekit-client";
import * as React from "react";
import { useMediaDevices } from "@livekit/components-react";

import type { LocalAudioTrack, LocalVideoTrack } from "livekit-client";

/** @public */
export type LocalUserChoices = {
  username: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  videoDeviceId: string;
  audioDeviceId: string;
};

// const DEFAULT_USER_CHOICES = {
//   username: "",
//   videoEnabled: true,
//   audioEnabled: true,
//   videoDeviceId: "",
//   audioDeviceId: "",
// };

/** @public */
export type PreJoinProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onSubmit"
> & {
  /** This function is called with the `LocalUserChoices` if validation is passed. */
  onSubmit?: (values: LocalUserChoices) => void;
  /**
   * Provide your custom validation function. Only if validation is successful the user choices are past to the onSubmit callback.
   */
  onValidate?: (values: LocalUserChoices) => boolean;
  onError?: (error: Error) => void;
  /** Prefill the input form with initial values. */
  defaults?: Partial<LocalUserChoices>;
  /** Display a debug window for your convenience. */
  debug?: boolean;
  joinLabel?: string;
  micLabel?: string;
  camLabel?: string;
  userLabel?: string;
};

/** @public */
export function usePreviewDevice<T extends LocalVideoTrack | LocalAudioTrack>(
  enabled: boolean,
  deviceId: string,
  kind: "videoinput" | "audioinput",
  prohibitTrackCreation: boolean,
  initialTrack?: LocalVideoTrack | LocalAudioTrack
) {
  const [deviceError, setDeviceError] = React.useState<Error | null>(null);

  const devices = useMediaDevices({ kind });
  const [selectedDevice, setSelectedDevice] = React.useState<
    MediaDeviceInfo | undefined
  >(undefined);

  const [localTrack, setLocalTrack] = React.useState<T>();
  const [localDeviceId, setLocalDeviceId] = React.useState<string>(deviceId);

  React.useEffect(() => {
    setLocalDeviceId(deviceId);
  }, [deviceId]);

  const createTrack = async (
    deviceId: string,
    kind: "videoinput" | "audioinput"
  ) => {
    try {
      let track = initialTrack;
      if (!prohibitTrackCreation && !initialTrack) {
        track =
          kind === "videoinput"
            ? await createLocalVideoTrack({
                deviceId: deviceId,
                resolution: VideoPresets.h720.resolution,
              })
            : await createLocalAudioTrack({ deviceId });
      }
      console.log("TRACK", track);
      if (track) {
        const newDeviceId = await track.getDeviceId();
        if (newDeviceId && deviceId !== newDeviceId) {
          prevDeviceId.current = newDeviceId;
          setLocalDeviceId(newDeviceId);
        }
        setLocalTrack(track as T);
      }
    } catch (e) {
      if (e instanceof Error) {
        setDeviceError(e);
      }
    }
  };

  const switchDevice = async (
    track: LocalVideoTrack | LocalAudioTrack,
    id: string
  ) => {
    await track.restartTrack({
      deviceId: id,
    });
    prevDeviceId.current = id;
  };

  const prevDeviceId = React.useRef(localDeviceId);

  React.useEffect(() => {
    if (enabled && !localTrack && !deviceError) {
      log.debug("creating track", kind);
      createTrack(localDeviceId, kind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, localTrack, deviceError, initialTrack]);

  // switch camera device
  React.useEffect(() => {
    if (!enabled) {
      if (localTrack) {
        log.debug(`muting ${kind} track`);
        localTrack.mute().then(() => log.debug(localTrack.mediaStreamTrack));
      }
      return;
    }
    if (
      localTrack &&
      selectedDevice?.deviceId &&
      prevDeviceId.current !== selectedDevice?.deviceId
    ) {
      log.debug(
        `switching ${kind} device from`,
        prevDeviceId.current,
        selectedDevice.deviceId
      );
      switchDevice(localTrack, selectedDevice.deviceId);
    } else {
      log.debug(`unmuting local ${kind} track`);
      localTrack?.unmute();
    }

    return () => {
      if (localTrack) {
        log.debug(`stopping local ${kind} track`);
        localTrack.stop();
        localTrack.mute();
      }
    };
  }, [localTrack, selectedDevice, enabled, kind]);

  React.useEffect(() => {
    setSelectedDevice(devices.find((dev) => dev.deviceId === localDeviceId));
  }, [localDeviceId, devices]);

  return {
    selectedDevice,
    localTrack,
    deviceError,
  };
}
