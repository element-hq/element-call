/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, useContext, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";

import { type MediaDevices } from "./state/MediaDevices";

export const MediaDevicesContext = createContext<MediaDevices | undefined>(
  undefined,
);

export function useMediaDevices(): MediaDevices {
  const mediaDevices = useContext(MediaDevicesContext);
  if (mediaDevices === undefined)
    throw new Error(
      "useMediaDevices must be used within a MediaDevices context provider",
    );
  return mediaDevices;
}

/**
 * A convenience hook to get the audio node configuration for the earpiece.
 * It will check the `useAsEarpiece` of the `audioOutput` device and return
 * the appropriate pan and volume values.
 *
 * @returns pan and volume values for the earpiece audio node configuration.
 */
export const useEarpieceAudioConfig = (): {
  pan: number;
  volume: number;
} => {
  const devices = useMediaDevices();
  const audioOutput = useObservableEagerState(devices.audioOutput.selected$);
  // We use only the right speaker (pan = 1) for the earpiece.
  // This mimics the behavior of the native earpiece speaker (only the top speaker on an iPhone)
  const pan = useMemo(
    () => (audioOutput?.virtualEarpiece ? 1 : 0),
    [audioOutput?.virtualEarpiece],
  );
  // We also do lower the volume by a factor of 10 to optimize for the usecase where
  // a user is holding the phone to their ear.
  const volume = useMemo(
    () => (audioOutput?.virtualEarpiece ? 0.1 : 1),
    [audioOutput?.virtualEarpiece],
  );
  return { pan, volume };
};
