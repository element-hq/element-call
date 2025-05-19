/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Subject } from "rxjs";

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

export const setPipEnabled$ = new Subject<boolean>();
export const setAvailableOutputDevices$ = new Subject<OutputDevice[]>();
export const setOutputDevice$ = new Subject<string>();
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
    if (!setAvailableOutputDevices$.observed)
      throw new Error("Output controls are disabled. No setAvailableOutputDevices$ observer");
    setAvailableOutputDevices$.next(devices);
  },
  setOutputDevice(id: string): void {
    if (!setOutputDevice$.observed)
      throw new Error("Output controls are disabled. No setOutputDevice$ observer");
    setOutputDevice$.next(id);
  },
  setOutputEnabled(enabled: boolean): void {
    if (!setOutputEnabled$.observed)
      throw new Error("Output controls are disabled. No setOutputEnabled$ observer");
    setOutputEnabled$.next(!enabled);
  },
};
