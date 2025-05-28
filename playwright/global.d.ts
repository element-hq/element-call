/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type * as Matrix from "matrix-js-sdk";

declare global {
  interface Window {
    mxMatrixClientPeg: {
      get(): Matrix.MatrixClient;
    };
    mxSettingsStore: {
      setValue: (
        settingKey: string,
        room: string | null,
        level: string,
        setting: string,
      ) => void;
    };
  }
}
