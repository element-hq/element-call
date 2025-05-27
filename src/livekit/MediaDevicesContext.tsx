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
import { combineLatest, map, startWith } from "rxjs";
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
import { outputDevice$, availableOutputDevices$ } from "../controls";
import { useUrlParams } from "../UrlParams";

// This hardcoded id is used in EX ios! It can only be changed in coordination with
// the ios swift team.
export const EARPIECE_CONFIG_ID = "earpiece-id";

export type DeviceLabel =
  | { type: "name"; name: string }
  | { type: "number"; number: number }
  | { type: "earpiece" }
  | { type: "default"; name: string | null };

export interface MediaDeviceHandle {
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
  audioInput: MediaDeviceHandle;
  videoInput: MediaDeviceHandle;
  startUsingDeviceNames: () => void;
  stopUsingDeviceNames: () => void;
  usingNames: boolean;
}

export interface MediaDevices extends Omit<InputDevices, "usingNames"> {
  audioOutput: MediaDeviceHandle;
}

/**
 * An observable that represents if we should display the devices menu for iOS.
 * This implies the following
 *  - hide any input devices (they do not work anyhow on ios)
 *  - Show a button to show the native output picker instead.
 *  - Only show the earpiece toggle option if the earpiece is available:
 *   `availableOutputDevices$.includes((d)=>d.forEarpiece)`
 */
export const iosDeviceMenu$ = alwaysShowIphoneEarpieceSetting.value$.pipe(
  map((v) => v || navigator.userAgent.includes("iPhone")),
);

function useSelectedId(
  available: Map<string, DeviceLabel>,
  preferredId: string | undefined,
): string | undefined {
  return useMemo(() => {
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
}

/**
 * Hook to get access to a mediaDevice handle for a kind. This allows to list
 * the available devices, read and set the selected device.
 * @param kind Audio input, output or video output.
 * @param setting The setting this handle's selection should be synced with.
 * @param usingNames If the hook should query device names for the associated
 *  list.
 * @returns A handle for the chosen kind.
 */
function useMediaDeviceHandle(
  kind: MediaDeviceKind,
  setting: Setting<string | undefined>,
  usingNames: boolean,
): MediaDeviceHandle {
  const hasRequestedPermissions = useRef(false);
  const requestPermissions = usingNames || hasRequestedPermissions.current;
  // Make sure we don't needlessly reset to a device observer without names,
  // once permissions are already given
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
              available.size
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
      [deviceObserver$, kind],
    ),
  );

  const [preferredId, select] = useSetting(setting);
  const selectedId = useSelectedId(available, preferredId);

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

  return useMemo(
    () => ({
      available,
      selectedId,
      useAsEarpiece: false,
      selectedGroupId,
      select,
    }),
    [available, selectedId, selectedGroupId, select],
  );
}

export const deviceStub: MediaDeviceHandle = {
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

  const audioInput = useMediaDeviceHandle(
    "audioinput",
    audioInputSetting,
    usingNames,
  );
  const videoInput = useMediaDeviceHandle(
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

  const { controlledAudioDevices } = useUrlParams();

  const webViewAudioOutput = useMediaDeviceHandle(
    "audiooutput",
    audioOutputSetting,
    usingNames,
  );
  const controlledAudioOutput = useControlledOutput();

  const context: MediaDevices = useMemo(
    () => ({
      audioInput,
      audioOutput: controlledAudioDevices
        ? controlledAudioOutput
        : webViewAudioOutput,
      videoInput,
      startUsingDeviceNames,
      stopUsingDeviceNames,
    }),
    [
      audioInput,
      controlledAudioDevices,
      controlledAudioOutput,
      webViewAudioOutput,
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

function useControlledOutput(): MediaDeviceHandle {
  const { available } = useObservableEagerState(
    useObservable(() => {
      const outputDeviceData$ = availableOutputDevices$.pipe(
        map((devices) => {
          const deviceForEarpiece = devices.find((d) => d.forEarpiece);
          const deviceMapTuple: [string, DeviceLabel][] = devices.map(
            ({ id, name, isEarpiece, isSpeaker /*,isExternalHeadset*/ }) => {
              let deviceLabel: DeviceLabel = { type: "name", name };
              // if (isExternalHeadset) // Do we want this?
              if (isEarpiece) deviceLabel = { type: "earpiece" };
              if (isSpeaker) deviceLabel = { type: "default", name };
              return [id, deviceLabel];
            },
          );
          return {
            devicesMap: new Map<string, DeviceLabel>(deviceMapTuple),
            deviceForEarpiece,
          };
        }),
      );

      return combineLatest(
        [outputDeviceData$, iosDeviceMenu$],
        ({ devicesMap, deviceForEarpiece }, iosShowEarpiece) => {
          let available = devicesMap;
          if (iosShowEarpiece && !!deviceForEarpiece) {
            available = new Map([
              ...devicesMap.entries(),
              [EARPIECE_CONFIG_ID, { type: "earpiece" }],
            ]);
          }
          return { available, deviceForEarpiece };
        },
      );
    }),
  );
  const [preferredId, setPreferredId] = useSetting(audioOutputSetting);
  useEffect(() => {
    const subscription = outputDevice$.subscribe((id) => {
      if (id) setPreferredId(id);
    });
    return (): void => subscription.unsubscribe();
  }, [setPreferredId]);

  const selectedId = useSelectedId(available, preferredId);

  const [asEarpiece, setAsEarpiece] = useState(false);

  useEffect(() => {
    // Let the hosting application know which output device has been selected.
    // This information is probably only of interest if the earpiece mode has been
    // selected - for example, Element X iOS listens to this to determine whether it
    // should enable the proximity sensor.
    if (selectedId) {
      window.controls.onAudioDeviceSelect?.(selectedId);
      // Call deprecated method for backwards compatibility.
      window.controls.onOutputDeviceSelect?.(selectedId);
    }
    setAsEarpiece(selectedId === EARPIECE_CONFIG_ID);
  }, [selectedId]);

  return useMemo(
    () => ({
      available: available,
      selectedId,
      selectedGroupId: undefined,
      select: setPreferredId,
      useAsEarpiece: asEarpiece,
    }),
    [available, selectedId, setPreferredId, asEarpiece],
  );
}

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
