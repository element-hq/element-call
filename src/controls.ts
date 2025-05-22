/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, Subject } from "rxjs";

export interface Controls {
  canEnterPip(): boolean;
  enablePip(): void;
  disablePip(): void;
  /** @deprecated use  setAvailableAudioDevices instead*/
  setAvailableOutputDevices(devices: OutputDevice[]): void;
  setAvailableAudioDevices(devices: OutputDevice[]): void;
  /** @deprecated use  setAudioDevice instead*/
  setOutputDevice(id: string): void;
  setAudioDevice(id: string): void;
  /** @deprecated use  onAudioDeviceSelect instead*/
  onOutputDeviceSelect?: (id: string) => void;
  onAudioDeviceSelect?: (id: string) => void;
  /** @deprecated use  setAudioEnabled instead*/
  setOutputEnabled(enabled: boolean): void;
  setAudioEnabled(enabled: boolean): void;
  /** @deprecated use  showNativeAudioDevicePicker instead*/
  showNativeOutputDevicePicker?: () => void;
  showNativeAudioDevicePicker?: () => void;
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
// BehaviorSubject since the client might set this before we have subscribed (GroupCallView still in "loading" state)
// We want the devices that have been set during loading to be available immediately once loaded.
export const availableOutputDevices$ = new BehaviorSubject<OutputDevice[]>([]);
// BehaviorSubject since the client might set this before we have subscribed (GroupCallView still in "loading" state)
// We want the device that has been set during loading to be available immediately once loaded.
export const outputDevice$ = new BehaviorSubject<string | undefined>(undefined);
/**
 * This allows the os to mute the call if the user
 * presses the volume down button when it is at the minimum volume.
 *
 * This should also be used to display a darkened overlay screen letting the user know that audio is muted.
 */
export const setAudioEnabled$ = new Subject<boolean>();

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
    availableOutputDevices$.next(devices);
  },
  setAudioDevice(id: string): void {
    outputDevice$.next(id);
  },
  setAudioEnabled(enabled: boolean): void {
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
