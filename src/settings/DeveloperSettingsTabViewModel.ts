/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest } from "rxjs";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel.ts";
import { type ObservableScope } from "../state/ObservableScope.ts";
import { createStaticViewModel, type ViewModel } from "../state/ViewModel.ts";
import { type DeveloperSettingsSnapshot } from "./DeveloperSettingsTab.tsx";

/**
 * Creates the ViewModel for the developer settings tab while in a call.
 *
 * Only the call state the tab actually renders is projected here, so that the
 * tab does not need to know about the CallViewModel.
 *
 * @param scope - ObservableScope that bounds the lifetime of derived behaviors.
 * @param callModel - The root CallViewModel; provides the key rotation state.
 */
export function createDeveloperSettingsTabViewModel(
  scope: ObservableScope,
  callModel: CallViewModel,
): ViewModel<DeveloperSettingsSnapshot> {
  return {
    keyRotation$: scope.behavior(
      combineLatest(
        [callModel.keyRotationSuppressed$, callModel.participantCount$],
        (suppressed, participantCount) => ({ suppressed, participantCount }),
      ),
    ),
  };
}

/**
 * The ViewModel for the developer settings tab outside of a call (lobby, user
 * menu), where no call state exists. All call specific fields are `null`.
 */
export const outOfCallDeveloperSettingsTabViewModel: ViewModel<DeveloperSettingsSnapshot> =
  createStaticViewModel<DeveloperSettingsSnapshot>({ keyRotation: null });
