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
  setOutputDevices(devices: OutputDevice[]): void;
  onOutputDeviceSelect?: (id: string) => void;
  setOutputEnabled(enabled: boolean): void;
}

export interface OutputDevice {
  id: string;
  name: string;
}

export const setPipEnabled$ = new Subject<boolean>();
export const setOutputDevices = new Subject<OutputDevice[]>();
export const setOutputEnabled = new Subject<boolean>();

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
  setOutputDevices(devices: OutputDevice[]): void {
    if (!setOutputDevices.observed)
      throw new Error("Output controls are disabled");
    setOutputDevices.next(devices);
  },
  setOutputEnabled(enabled: boolean): void {
    if (!setOutputEnabled.observed)
      throw new Error("Output controls are disabled");
    setOutputEnabled.next(enabled);
  },
};
