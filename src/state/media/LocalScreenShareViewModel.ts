/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LocalParticipant } from "livekit-client";

import { type Behavior } from "../Behavior";
import {
  type BaseScreenShareInputs,
  type BaseScreenShareViewModel,
  createBaseScreenShare,
} from "./ScreenShareViewModel";
import { type ObservableScope } from "../ObservableScope";

export interface LocalScreenShareViewModel extends BaseScreenShareViewModel {
  local: true;
}

export interface LocalScreenShareInputs extends BaseScreenShareInputs {
  participant$: Behavior<LocalParticipant | null>;
}

export function createLocalScreenShare(
  scope: ObservableScope,
  inputs: LocalScreenShareInputs,
): LocalScreenShareViewModel {
  return { ...createBaseScreenShare(scope, inputs), local: true };
}
