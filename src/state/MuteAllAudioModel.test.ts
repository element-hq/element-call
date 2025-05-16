/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map, startWith } from "rxjs";
import { test, vi } from "vitest";
import { expect } from "vitest";

import { setOutputEnabled$ } from "../controls";
import { muteAllAudio as muteAllAudioSetting } from "../settings/settings";

/**
 * This can transition into sth more complete: `GroupCallViewModel.ts`
 */
export const muteAllAudio$ = combineLatest([
  setOutputEnabled$,
  muteAllAudioSetting.value$,
]).pipe(
  startWith([true, muteAllAudioSetting.getValue()]),
  map(([outputEndabled, settingsMute]) => !outputEndabled || settingsMute),
);
test("muteAllAudio$", () => {
  const valueMock = vi.fn();
  const muteAllAudio = muteAllAudio$.subscribe((value) => {
    valueMock(value);
  });

  setOutputEnabled$.next(false);
  setOutputEnabled$.next(true);
  muteAllAudioSetting.setValue(false);
  muteAllAudioSetting.setValue(true);
  setOutputEnabled$.next(false);

  muteAllAudio.unsubscribe();

  expect(valueMock).toHaveBeenCalledTimes(6);
  expect(valueMock).toHaveBeenNthCalledWith(1, false); // startWith([false, muteAllAudioSetting.getValue()]);
  expect(valueMock).toHaveBeenNthCalledWith(2, true); // setOutputEnabled$.next(false);
  expect(valueMock).toHaveBeenNthCalledWith(3, false); // setOutputEnabled$.next(true);
  expect(valueMock).toHaveBeenNthCalledWith(4, false); // muteAllAudioSetting.setValue(false);
  expect(valueMock).toHaveBeenNthCalledWith(5, true); // muteAllAudioSetting.setValue(true);
  expect(valueMock).toHaveBeenNthCalledWith(6, true); // setOutputEnabled$.next(false);
});
