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

export interface OutputDevice {
  id: string;
  name: string;
  forEarpiece?: boolean;
  isEarpiece?: boolean;
  isSpeaker?: boolean;
  isExternalHeadset?: boolean;
}

/**
 * If pipMode is enabled, EC will render a adapted call view layout.
 */
export const setPipEnabled$ = new Subject<boolean>();

export const availableOutputDevices$ = new Subject<OutputDevice[]>();

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

  setAvailableAudioDevices(devices: OutputDevice[]): void {
    logger.info("setAvailableAudioDevices called from native:", devices);
    availableOutputDevices$.next(devices);
  },
  setAudioDevice(id: string): void {
    logger.info("setAudioDevice called from native", id);
    outputDevice$.next(id);
  },
  setAudioEnabled(enabled: boolean): void {
    logger.info("setAudioEnabled called from native:", enabled);
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
