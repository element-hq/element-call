/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map, startWith } from "rxjs";

import { setOutputEnabled$ } from "../controls";
import { muteAllAudio as muteAllAudioSetting } from "../settings/settings";

/**
 * This can transition into sth more complete: `GroupCallViewModel.ts`
 */
export const muteAllAudio$ = combineLatest([
  setOutputEnabled$,
  muteAllAudioSetting.value$,
]).pipe(
  startWith([false, muteAllAudioSetting.getValue()]),
  map(([outputEndabled, settingsMute]) => !outputEndabled || settingsMute),
);
