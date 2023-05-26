import { useEffect, useState } from "react";

import { MediaDevicesManager } from "./mediaDevices";

export type MediaDevices = {
  available: MediaDeviceInfo[];
  selected: number;
};

export type MediaDevicesState = {
  state: Map<MediaDeviceKind, MediaDevices>;
  selectActiveDevice: (
    kind: MediaDeviceKind,
    deviceId: string
  ) => Promise<void>;
};

export function useMediaDevices(
  mediaDeviceHandler: MediaDevicesManager
): MediaDevicesState {
  // Create a React state to store the available devices and the selected device for each kind.
  const [state, setState] = useState<Map<MediaDeviceKind, MediaDevices>>(
    new Map()
  );

  // Update the React state when the available devices change.
  useEffect(() => {
    // Define a callback that is going to be called each time the available devices change.
    const updateDevices = async () => {
      const mediaDeviceKinds: MediaDeviceKind[] = [
        "audioinput",
        "audiooutput",
        "videoinput",
      ];

      const newState = new Map(state);

      // Request all the available devices for each kind.
      for (const kind of mediaDeviceKinds) {
        const devices = await mediaDeviceHandler.getDevices(
          kind as MediaDeviceKind
        );

        // If newly requested devices are empty, remove the kind from the React state.
        if (devices.length === 0) {
          newState.delete(kind);
          continue;
        }

        // Otherwise, check if the current state contains any selected device and find this device in the new list of devices.
        // If the device exists, update the React state with the new list of devices and the index of the selected device.
        // If the device does not exist, select the first one (default device).
        const selectedDevice = state.get(kind);
        const newSelectedDeviceIndex = selectedDevice
          ? devices.findIndex(
              (device) =>
                device.deviceId ===
                selectedDevice.available[selectedDevice.selected].deviceId
            )
          : 0;

        newState.set(kind, {
          available: devices,
          selected: newSelectedDeviceIndex !== -1 ? newSelectedDeviceIndex : 0,
        });
      }

      if (devicesChanged(state, newState)) {
        setState(newState);
      }
    };

    updateDevices();

    mediaDeviceHandler.on("devicesChanged", updateDevices);
    return () => {
      mediaDeviceHandler.off("devicesChanged", updateDevices);
    };
  }, [mediaDeviceHandler, state]);

  const selectActiveDeviceFunc = async (
    kind: MediaDeviceKind,
    deviceId: string
  ) => {
    await mediaDeviceHandler.setActiveDevice(kind, deviceId);

    // Update react state as well.
    setState((prevState) => {
      const newState = new Map(prevState);
      const devices = newState.get(kind);
      if (!devices) {
        return newState;
      }

      const newSelectedDeviceIndex = devices.available.findIndex(
        (device) => device.deviceId === deviceId
      );

      newState.set(kind, {
        available: devices.available,
        selected: newSelectedDeviceIndex,
      });

      return newState;
    });
  };

  const [selectActiveDevice] = useState<
    (kind: MediaDeviceKind, deviceId: string) => Promise<void>
  >(selectActiveDeviceFunc);

  return {
    state,
    selectActiveDevice,
  };
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

    if (value.selected !== newValue.selected) {
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
