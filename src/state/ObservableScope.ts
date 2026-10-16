/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ObservableScope } from "@element-hq/matrixrtc-sdk";

export {
  Epoch,
  mapEpoch,
  ObservableScope,
  trackEpoch,
} from "@element-hq/matrixrtc-sdk";

/**
 * The global scope, a scope which never ends.
 */
export const globalScope = new ObservableScope();
