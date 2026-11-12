/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ObservableScope } from "@element-hq/matrixrtc-sdk";

import {
  type BaseScreenShareInputs,
  type BaseScreenShareViewModel,
  createBaseScreenShare,
} from "./ScreenShareViewModel";

export interface LocalScreenShareViewModel extends BaseScreenShareViewModel {
  local: true;
}

export type LocalScreenShareInputs = BaseScreenShareInputs;

export function createLocalScreenShare(
  scope: ObservableScope,
  inputs: LocalScreenShareInputs,
): LocalScreenShareViewModel {
  return { ...createBaseScreenShare(scope, inputs), local: true };
}
