/*
Copyright 2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
