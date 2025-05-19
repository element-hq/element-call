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
  setAvailableOutputDevices(devices: OutputDevice[]): void;
  setOutputDevice(id: string): void;
  onOutputDeviceSelect?: (id: string) => void;
  setOutputEnabled(enabled: boolean): void;
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
// BehaviorSubject since the client might set this before we have subscribed (GroupCallView still in "loading" state)
// We want the that has been set during loading to be be available immediately once loaded.
export const setAvailableOutputDevices$ = new BehaviorSubject<OutputDevice[]>(
  [],
);
// BehaviorSubject since the client might set this before we have subscribed (GroupCallView still in "loading" state)
// We want the that has been set during loading to be be available immediately once loaded.
export const setOutputDevice$ = new BehaviorSubject<string | undefined>(
  undefined,
);
/**
 * This is currently unused. It might be possible to allow the os to mute the call this way if the user
 * presses the volume down button when it is at the minimum volume.
 *
 * This should also be used to display a darkened overlay screen letting the user know that audio is muted.
 */
export const setOutputEnabled$ = new Subject<boolean>();

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
  setAvailableOutputDevices(devices: OutputDevice[]): void {
    setAvailableOutputDevices$.next(devices);
  },
  setOutputDevice(id: string): void {
    setOutputDevice$.next(id);
  },
  setOutputEnabled(enabled: boolean): void {
    if (!setOutputEnabled$.observed)
      throw new Error(
        "Output controls are disabled. No setOutputEnabled$ observer",
      );
    setOutputEnabled$.next(!enabled);
  },
};
