/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, startWith } from "rxjs";

import { setAudioEnabled$ } from "../controls";
import { muteAllAudio as muteAllAudioSetting } from "../settings/settings";
import { globalScope } from "./ObservableScope";

/**
 * This can transition into sth more complete: `GroupCallViewModel.ts`
 */
export const muteAllAudio$ = globalScope.behavior(
  combineLatest(
    [setAudioEnabled$.pipe(startWith(true)), muteAllAudioSetting.value$],
    (outputEnabled, settingsMute) => !outputEnabled || settingsMute,
  ),
);
