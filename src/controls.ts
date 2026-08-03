/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Subject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

export interface Controls {
  canEnterPip(): boolean;
  enablePip(): void;
  disablePip(): void;
  onPipMediaOrientationUpdate?: (orientation: "landscape" | "portrait") => void;

  setAvailableAudioDevices(devices: OutputDevice[]): void;
  setAudioDevice(id: string): void;
  onAudioDeviceSelect?: (id: string) => void;
  onAudioPlaybackStarted?: () => void;
  setAudioEnabled(enabled: boolean): void;
  showNativeAudioDevicePicker?: () => void;
  onBackButtonPressed?: () => void;

  /** @deprecated use  setAvailableAudioDevices instead*/
  setAvailableOutputDevices(devices: OutputDevice[]): void;
  /** @deprecated use  setAudioDevice instead*/
  setOutputDevice(id: string): void;
  /** @deprecated use  onAudioDeviceSelect instead*/
  onOutputDeviceSelect?: (id: string) => void;
  /** @deprecated use  setAudioEnabled instead*/
  setOutputEnabled(enabled: boolean): void;
  /** @deprecated use  showNativeAudioDevicePicker instead*/
  showNativeOutputDevicePicker?: () => void;
}

/**
 * Output Audio device when using the controlled audio output mode (mobile).
 */
export interface OutputDevice {
  id: string;
  name: string;
  /**
   * `forEarpiece` in an iOS only flag, that will be set on the default speaker device.
   * The default speaker device will be used for the earpiece mode by
   * using a stereo pan and reducing the volume significantly. (in combination this is similar to a dedicated earpiece mode)
   *  - on iOS this is true if output is routed to speaker.
   *    In that case then ElementCalls manually appends an earpiece device with id `EARPIECE_CONFIG_ID` and `{ type: "earpiece" }`
   *  - on Android this is unused.
   */
  forEarpiece?: boolean;
  /**
   * Is the device the OS earpiece audio configuration?
   * - on iOS always undefined
   * - on Android true for the `TYPE_BUILTIN_EARPIECE`
   */
  isEarpiece?: boolean;
  /**
   *  Is the device the OS default speaker:
   * - on iOS always true if output is routed to speaker. In other case iOS on declare a `dummy` id device.
   * - on Android true for the `TYPE_BUILTIN_SPEAKER`
   */
  isSpeaker?: boolean;
  /**
   * Is the device the OS default external headset (bluetooth):
   * - on iOS always undefined.
   * - on Android true for the `TYPE_BLUETOOTH_SCO`
   */
  isExternalHeadset?: boolean;
}

/**
 * If pipMode is enabled, EC will render a adapted call view layout.
 */
export const setPipEnabled$ = new Subject<boolean>();

/**
 * Stores the list of available controlled audio output devices.
 * This is set when the native code calls `setAvailableAudioDevices` with the list of available audio output devices.
 */
export const availableOutputDevices$ = new Subject<OutputDevice[]>();

/**
 * Stores the current audio output device id.
 * This is set when the native code calls `setAudioDevice`
 */
export const outputDevice$ = new Subject<string>();

/**
 * This allows the os to mute the call if the user
 * presses the volume down button when it is at the minimum volume.
 *
 * This should also be used to display a darkened overlay screen letting the user know that audio is muted.
 */
export const setAudioEnabled$ = new Subject<boolean>();

let playbackStartedEmitted = false;
export const setPlaybackStarted = (): void => {
  if (!playbackStartedEmitted) {
    playbackStartedEmitted = true;
    window.controls.onAudioPlaybackStarted?.();
  }
};

window.controls = {
  canEnterPip(): boolean {
    return setPipEnabled$.observed;
  },
  enablePip(): void {
    if (!setPipEnabled$.observed) throw new Error("No call is running");
    setPipEnabled$.next(true);
  },
  disablePip(): void {
    if (!setPipEnabled$.observed) throw new Error("No call is running");
    setPipEnabled$.next(false);
  },

  /**
   * Reverse engineered:
   *
   * - on iOS:
   *  This always a list of one thing. If current route output is speaker it returns
   *  the single `{"id":"Speaker","name":"Speaker","forEarpiece":true,"isSpeaker":true}` Notice that EC will
   *  also manually add a virtual earpiece device with id `EARPIECE_CONFIG_ID` and `{ type: "earpiece" }`.
   *  If the route output is not speaker then it will be `{id: 'dummy', name: 'dummy'}`
   *
   *
   *  - on Android:
   *  This is a list of all available output audio devices. The `id` is the Android AudioDeviceInfo.getId()
   *  and the `name` is based the Android AudioDeviceInfo.productName (mapped to static strings for known types)
   *  The `isEarpiece`, `isSpeaker` and `isExternalHeadset` are set based on the Android AudioDeviceInfo.type
   *  matching the corresponding types for earpiece, speaker and bluetooth headset.
   */
  setAvailableAudioDevices(devices: OutputDevice[]): void {
    logger.info(
      "[MediaDevices controls] setAvailableAudioDevices called from native:",
      devices,
    );
    availableOutputDevices$.next(devices);
  },
  setAudioDevice(id: string): void {
    logger.info(
      "[MediaDevices controls] setAudioDevice called from native",
      id,
    );
    outputDevice$.next(id);
  },
  setAudioEnabled(enabled: boolean): void {
    logger.info(
      "[MediaDevices controls] setAudioEnabled called from native:",
      enabled,
    );
    if (!setAudioEnabled$.observed)
      throw new Error(
        "Output controls are disabled. No setAudioEnabled$ observer",
      );
    setAudioEnabled$.next(enabled);
  },

  // wrappers for the deprecated controls fields
  setOutputEnabled(enabled: boolean): void {
    this.setAudioEnabled(enabled);
  },
  setAvailableOutputDevices(devices: OutputDevice[]): void {
    this.setAvailableAudioDevices(devices);
  },
  setOutputDevice(id: string): void {
    this.setAudioDevice(id);
  },
};
