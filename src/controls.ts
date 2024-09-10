/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { Subject } from "rxjs";

export interface Controls {
  canEnterPip: () => boolean;
  enablePip: () => void;
  disablePip: () => void;
}

export const setPipEnabled = new Subject<boolean>();

window.controls = {
  canEnterPip(): boolean {
    return setPipEnabled.observed;
  },
  enablePip(): void {
    if (!setPipEnabled.observed) throw new Error("No call is running");
    setPipEnabled.next(true);
  },
  disablePip(): void {
    if (!setPipEnabled.observed) throw new Error("No call is running");
    setPipEnabled.next(false);
  },
};
