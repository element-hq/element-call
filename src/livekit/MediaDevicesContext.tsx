/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createMediaDeviceObserver } from "@livekit/components-core";
import { map, startWith } from "rxjs";
import { useObservableEagerState } from "observable-hooks";
import { logger } from "matrix-js-sdk/src/logger";

import {
  useSetting,
  audioInput as audioInputSetting,
  audioOutput as audioOutputSetting,
  videoInput as videoInputSetting,
  type Setting,
} from "../settings/settings";

export type DeviceLabel =
  | { type: "name"; name: string }
  | { type: "number"; number: number }
  | { type: "default"; name: string | null };

export interface MediaDevice {
  /**
   * A map from available device IDs to labels.
   */
  available: Map<string, DeviceLabel>;
  selectedId: string | undefined;
  /**
   * The group ID of the selected device.
   */
  // This is exposed sort of ad-hoc because it's only needed for knowing when to
  // restart the tracks of default input devices, and ideally this behavior
  // would be encapsulated somehow…
  selectedGroupId: string | undefined;
  select: (deviceId: string) => void;
}

export interface MediaDevices {
  audioInput: MediaDevice;
  audioOutput: MediaDevice;
  videoInput: MediaDevice;
  startUsingDeviceNames: () => void;
  stopUsingDeviceNames: () => void;
}

function useMediaDevice(
  kind: MediaDeviceKind,
  setting: Setting<string | undefined>,
  usingNames: boolean,
): MediaDevice {
  // Make sure we don't needlessly reset to a device observer without names,
  // once permissions are already given
  const hasRequestedPermissions = useRef(false);
  const requestPermissions = usingNames || hasRequestedPermissions.current;
  hasRequestedPermissions.current ||= usingNames;

  // We use a bare device observer here rather than one of the fancy device
  // selection hooks from @livekit/components-react, because
  // useMediaDeviceSelect expects a room or track, which we don't have here, and
  // useMediaDevices provides no way to request device names.
  // Tragically, the only way to get device names out of LiveKit is to specify a
  // kind, which then results in multiple permissions requests.
  const deviceObserver = useMemo(
    () =>
      createMediaDeviceObserver(
        kind,
        () => logger.error("Error creating MediaDeviceObserver"),
        requestPermissions,
      ).pipe(startWith([])),
    [kind, requestPermissions],
  );
  const available = useObservableEagerState(
    useMemo(
      () =>
        deviceObserver.pipe(
          map((availableRaw) => {
            // Sometimes browsers (particularly Firefox) can return multiple device
            // entries for the exact same device ID; using a map deduplicates them
            let available = new Map<string, DeviceLabel>(
              availableRaw.map((d, i) => [
                d.deviceId,
                d.label
                  ? { type: "name", name: d.label }
                  : { type: "number", number: i + 1 },
              ]),
            );
            // Create a virtual default audio output for browsers that don't have one.
            // Its device ID must be the empty string because that's what setSinkId
            // recognizes.
            if (
              kind === "audiooutput" &&
              available.size &&
              !available.has("") &&
              !available.has("default")
            )
              available = new Map([
                ["", { type: "default", name: availableRaw[0]?.label || null }],
                ...available,
              ]);
            // Note: creating virtual default input devices would be another problem
            // entirely, because requesting a media stream from deviceId "" won't
            // automatically track the default device.
            return available;
          }),
        ),
      [kind, deviceObserver],
    ),
  );

  const [preferredId, select] = useSetting(setting);
  const selectedId = useMemo(() => {
    if (available.size) {
      // If the preferred device is available, use it. Or if every available
      // device ID is falsy, the browser is probably just being paranoid about
      // fingerprinting and we should still try using the preferred device.
      // Worst case it is not available and the browser will gracefully fall
      // back to some other device for us when requesting the media stream.
      // Otherwise, select the first available device.
      return (preferredId !== undefined && available.has(preferredId)) ||
        (available.size === 1 && available.has(""))
        ? preferredId
        : available.keys().next().value;
    }
    return undefined;
  }, [available, preferredId]);
  const selectedGroupId = useObservableEagerState(
    useMemo(
      () =>
        deviceObserver.pipe(
          map(
            (availableRaw) =>
              availableRaw.find((d) => d.deviceId === selectedId)?.groupId,
          ),
        ),
      [deviceObserver, selectedId],
    ),
  );

  return useMemo(
    () => ({
      available,
      selectedId,
      selectedGroupId,
      select,
    }),
    [available, selectedId, selectedGroupId, select],
  );
}

export const deviceStub: MediaDevice = {
  available: new Map(),
  selectedId: undefined,
  selectedGroupId: undefined,
  select: () => {},
};
export const devicesStub: MediaDevices = {
  audioInput: deviceStub,
  audioOutput: deviceStub,
  videoInput: deviceStub,
  startUsingDeviceNames: () => {},
  stopUsingDeviceNames: () => {},
};

export const MediaDevicesContext = createContext<MediaDevices>(devicesStub);

interface Props {
  children: JSX.Element;
}

export const MediaDevicesProvider: FC<Props> = ({ children }) => {
  // Counts the number of callers currently using device names.
  const [numCallersUsingNames, setNumCallersUsingNames] = useState(0);
  const usingNames = numCallersUsingNames > 0;

  const audioInput = useMediaDevice(
    "audioinput",
    audioInputSetting,
    usingNames,
  );
  const audioOutput = useMediaDevice(
    "audiooutput",
    audioOutputSetting,
    usingNames,
  );
  const videoInput = useMediaDevice(
    "videoinput",
    videoInputSetting,
    usingNames,
  );

  const startUsingDeviceNames = useCallback(
    () => setNumCallersUsingNames((n) => n + 1),
    [setNumCallersUsingNames],
  );
  const stopUsingDeviceNames = useCallback(
    () => setNumCallersUsingNames((n) => n - 1),
    [setNumCallersUsingNames],
  );

  const context: MediaDevices = useMemo(
    () => ({
      audioInput,
      audioOutput,
      videoInput,
      startUsingDeviceNames,
      stopUsingDeviceNames,
    }),
    [
      audioInput,
      audioOutput,
      videoInput,
      startUsingDeviceNames,
      stopUsingDeviceNames,
    ],
  );

  return (
    <MediaDevicesContext.Provider value={context}>
      {children}
    </MediaDevicesContext.Provider>
  );
};

export const useMediaDevices = (): MediaDevices =>
  useContext(MediaDevicesContext);

/**
 * React hook that requests for the media devices context to be populated with
 * real device names while this component is mounted. This is not done by
 * default because it may involve requesting additional permissions from the
 * user.
 */
export const useMediaDeviceNames = (
  context: MediaDevices,
  enabled = true,
): void =>
  useEffect(() => {
    if (enabled) {
      context.startUsingDeviceNames();
      return context.stopUsingDeviceNames;
    }
  }, [context, enabled]);
