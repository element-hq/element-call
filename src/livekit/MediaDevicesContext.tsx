/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  FC,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createMediaDeviceObserver } from "@livekit/components-core";
import { Observable } from "rxjs";
import { logger } from "matrix-js-sdk/src/logger";

import {
  useSetting,
  audioInput as audioInputSetting,
  audioOutput as audioOutputSetting,
  videoInput as videoInputSetting,
  Setting,
} from "../settings/settings";
import { isFirefox } from "../Platform";

export interface MediaDevice {
  available: MediaDeviceInfo[];
  selectedId: string | undefined;
  select: (deviceId: string) => void;
}

export interface MediaDevices {
  audioInput: MediaDevice;
  audioOutput: MediaDevice;
  videoInput: MediaDevice;
  startUsingDeviceNames: () => void;
  stopUsingDeviceNames: () => void;
}

// Cargo-culted from @livekit/components-react
function useObservableState<T>(
  observable: Observable<T> | undefined,
  startWith: T,
): T {
  const [state, setState] = useState<T>(startWith);
  useEffect(() => {
    // observable state doesn't run in SSR
    if (typeof window === "undefined" || !observable) return;
    const subscription = observable.subscribe(setState);
    return (): void => subscription.unsubscribe();
  }, [observable]);
  return state;
}

function useMediaDevice(
  kind: MediaDeviceKind,
  setting: Setting<string | undefined>,
  usingNames: boolean,
  alwaysDefault: boolean = false,
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
      ),
    [kind, requestPermissions],
  );
  const available = useObservableState(deviceObserver, []);
  const [preferredId, select] = useSetting(setting);

  return useMemo(() => {
    let selectedId: string | undefined = undefined;
    if (!alwaysDefault && available) {
      // If the preferred device is available, use it. Or if every available
      // device ID is falsy, the browser is probably just being paranoid about
      // fingerprinting and we should still try using the preferred device.
      // Worst case it is not available and the browser will gracefully fall
      // back to some other device for us when requesting the media stream.
      // Otherwise, select the first available device.
      selectedId =
        available.some((d) => d.deviceId === preferredId) ||
        available.every((d) => d.deviceId === "")
          ? preferredId
          : available.at(0)?.deviceId;
    }

    return {
      available: available
        ? // Sometimes browsers (particularly Firefox) can return multiple
          // device entries for the exact same device ID; deduplicate them
          [...new Map(available.map((d) => [d.deviceId, d])).values()]
        : [],
      selectedId,
      select,
    };
  }, [available, preferredId, select, alwaysDefault]);
}

export const deviceStub: MediaDevice = {
  available: [],
  selectedId: undefined,
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

  // Setting the audio device to something other than 'undefined' breaks echo-cancellation
  // and even can introduce multiple different output devices for one call.
  const alwaysUseDefaultAudio = isFirefox();

  // On FF we dont need to query the names
  // (call enumerateDevices + create meadia stream to trigger permissions)
  // for ouput devices because the selector wont be shown on FF.
  const useOutputNames = usingNames && !isFirefox();

  const audioInput = useMediaDevice(
    "audioinput",
    audioInputSetting,
    usingNames,
  );
  const audioOutput = useMediaDevice(
    "audiooutput",
    audioOutputSetting,
    useOutputNames,
    alwaysUseDefaultAudio,
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
