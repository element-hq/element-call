/*
Copyright 2023-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
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
  type JSX,
} from "react";
import { createMediaDeviceObserver } from "@livekit/components-core";
import { map, startWith } from "rxjs";
import { useObservable, useObservableEagerState } from "observable-hooks";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  useSetting,
  audioInput as audioInputSetting,
  audioOutput as audioOutputSetting,
  videoInput as videoInputSetting,
  alwaysShowIphoneEarpiece as alwaysShowIphoneEarpieceSetting,
  type Setting,
} from "../settings/settings";
import { type OutputDevice, setOutputDevices$ } from "../controls";

export const EARPIECE_CONFIG_ID = "earpiece-id";

export type DeviceLabel =
  | { type: "name"; name: string }
  | { type: "number"; number: number }
  | { type: "earpiece" }
  | { type: "default"; name: string | null };

export interface MediaDevice {
  /**
   * A map from available device IDs to labels.
   */
  available: Map<string, DeviceLabel>;
  selectedId: string | undefined;
  /**
   * An additional device configuration that makes us use only one channel of the
   * output device and a reduced volume.
   */
  useAsEarpiece: boolean | undefined;
  /**
   * The group ID of the selected device.
   */
  // This is exposed sort of ad-hoc because it's only needed for knowing when to
  // restart the tracks of default input devices, and ideally this behavior
  // would be encapsulated somehow…
  selectedGroupId: string | undefined;
  select: (deviceId: string) => void;
}

interface InputDevices {
  audioInput: MediaDevice;
  videoInput: MediaDevice;
  startUsingDeviceNames: () => void;
  stopUsingDeviceNames: () => void;
  usingNames: boolean;
}

export interface MediaDevices extends Omit<InputDevices, "usingNames"> {
  audioOutput: MediaDevice;
}
function useShowEarpiece(): boolean {
  const [alwaysShowIphoneEarpice] = useSetting(alwaysShowIphoneEarpieceSetting);
  const m = useMemo(
    () =>
      (navigator.userAgent.match("iPhone")?.length ?? 0) > 0 ||
      alwaysShowIphoneEarpice,
    [alwaysShowIphoneEarpice],
  );
  return m;
}

function useMediaDevice(
  kind: MediaDeviceKind,
  setting: Setting<string | undefined>,
  usingNames: boolean,
): MediaDevice {
  // Make sure we don't needlessly reset to a device observer without names,
  // once permissions are already given
  const showEarpiece = useShowEarpiece();
  const hasRequestedPermissions = useRef(false);
  const requestPermissions = usingNames || hasRequestedPermissions.current;
  hasRequestedPermissions.current ||= usingNames;

  // We use a bare device observer here rather than one of the fancy device
  // selection hooks from @livekit/components-react, because
  // useMediaDeviceSelect expects a room or track, which we don't have here, and
  // useMediaDevices provides no way to request device names.
  // Tragically, the only way to get device names out of LiveKit is to specify a
  // kind, which then results in multiple permissions requests.
  const deviceObserver$ = useMemo(
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
        deviceObserver$.pipe(
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
            // We also create this if we do not have any available devices, so that
            // we can use the default or the earpiece.
            if (
              kind === "audiooutput" &&
              !available.has("") &&
              !available.has("default") &&
              (available.size || showEarpiece)
            )
              available = new Map([
                ["", { type: "default", name: availableRaw[0]?.label || null }],
                ...available,
              ]);
            if (kind === "audiooutput" && showEarpiece)
              // On IPhones we have to create a virtual earpiece device, because
              // the earpiece is not available as a device ID.
              available = new Map([
                ...available,
                [EARPIECE_CONFIG_ID, { type: "earpiece" }],
              ]);
            // Note: creating virtual default input devices would be another problem
            // entirely, because requesting a media stream from deviceId "" won't
            // automatically track the default device.
            return available;
          }),
        ),
      [deviceObserver$, kind, showEarpiece],
    ),
  );

  const [preferredId, setPreferredId] = useSetting(setting);
  const [asEarpice, setAsEarpiece] = useState(false);
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
        deviceObserver$.pipe(
          map(
            (availableRaw) =>
              availableRaw.find((d) => d.deviceId === selectedId)?.groupId,
          ),
        ),
      [deviceObserver$, selectedId],
    ),
  );

  const select = useCallback(
    (id: string) => {
      if (id === EARPIECE_CONFIG_ID) {
        setAsEarpiece(true);
      } else {
        setAsEarpiece(false);
        setPreferredId(id);
      }
    },
    [setPreferredId],
  );

  return useMemo(
    () => ({
      available,
      selectedId,
      useAsEarpiece: asEarpice,
      selectedGroupId,
      select,
    }),
    [available, selectedId, asEarpice, selectedGroupId, select],
  );
}

export const deviceStub: MediaDevice = {
  available: new Map(),
  selectedId: undefined,
  selectedGroupId: undefined,
  select: () => {},
  useAsEarpiece: false,
};
export const devicesStub: MediaDevices = {
  audioInput: deviceStub,
  audioOutput: deviceStub,
  videoInput: deviceStub,
  startUsingDeviceNames: () => {},
  stopUsingDeviceNames: () => {},
};

export const MediaDevicesContext = createContext<MediaDevices>(devicesStub);

function useInputDevices(): InputDevices {
  // Counts the number of callers currently using device names.
  const [numCallersUsingNames, setNumCallersUsingNames] = useState(0);
  const usingNames = numCallersUsingNames > 0;

  const audioInput = useMediaDevice(
    "audioinput",
    audioInputSetting,
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

  return {
    audioInput,
    videoInput,
    startUsingDeviceNames,
    stopUsingDeviceNames,
    usingNames,
  };
}

interface Props {
  children: JSX.Element;
}

export const MediaDevicesProvider: FC<Props> = ({ children }) => {
  const {
    audioInput,
    videoInput,
    startUsingDeviceNames,
    stopUsingDeviceNames,
    usingNames,
  } = useInputDevices();

  const audioOutput = useMediaDevice(
    "audiooutput",
    audioOutputSetting,
    usingNames,
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

function useControlledOutput(): MediaDevice {
  const showEarpiece = useShowEarpiece();

  const available = useObservableEagerState(
    useObservable(() =>
      setOutputDevices$.pipe(
        startWith<OutputDevice[]>([]),
        map((devices) => {
          const devicesMap = new Map<string, DeviceLabel>(
            devices.map(({ id, name }) => [id, { type: "name", name }]),
          );
          if (showEarpiece)
            devicesMap.set(EARPIECE_CONFIG_ID, { type: "earpiece" });
          return devicesMap;
        }),
      ),
    ),
  );
  const earpiceDevice = useObservableEagerState(
    setOutputDevices$.pipe(
      map((devices) => devices.find((d) => d.forEarpiece)),
    ),
  );

  const [preferredId, setPreferredId] = useSetting(audioOutputSetting);

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

  useEffect(() => {
    if (selectedId === EARPIECE_CONFIG_ID)
      if (selectedId !== undefined)
        window.controls.onOutputDeviceSelect?.(selectedId);
  }, [selectedId]);

  const [asEarpice, setAsEarpiece] = useState(false);

  const select = useCallback(
    (id: string) => {
      if (id === EARPIECE_CONFIG_ID) {
        setAsEarpiece(true);
        if (earpiceDevice) setPreferredId(earpiceDevice.id);
      } else {
        setAsEarpiece(false);
        setPreferredId(id);
      }
    },
    [earpiceDevice, setPreferredId],
  );

  return useMemo(
    () => ({
      available: available,
      selectedId,
      selectedGroupId: undefined,
      select,
      useAsEarpiece: asEarpice,
    }),
    [available, selectedId, select, asEarpice],
  );
}

export const ControlledOutputMediaDevicesProvider: FC<Props> = ({
  children,
}) => {
  const {
    audioInput,
    videoInput,
    startUsingDeviceNames,
    stopUsingDeviceNames,
  } = useInputDevices();
  const audioOutput = useControlledOutput();

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
  const { audioOutput } = useMediaDevices();
  // We use only the right speaker (pan = 1) for the earpiece.
  // This mimics the behavior of the native earpiece speaker (only the top speaker on an iPhone)
  const pan = useMemo(
    () => (audioOutput.useAsEarpiece ? 1 : 0),
    [audioOutput.useAsEarpiece],
  );
  // We also do lower the volume by a factor of 10 to optimize for the usecase where
  // a user is holding the phone to their ear.
  const volume = useMemo(
    () => (audioOutput.useAsEarpiece ? 0.1 : 1),
    [audioOutput.useAsEarpiece],
  );
  return { pan, volume };
};
