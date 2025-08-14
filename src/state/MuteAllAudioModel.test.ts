/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, vi } from "vitest";
import { expect } from "vitest";

import { setAudioEnabled$ } from "../controls";
import { muteAllAudio as muteAllAudioSetting } from "../settings/settings";
import { muteAllAudio$ } from "./MuteAllAudioModel";

test("muteAllAudio$", () => {
  const valueMock = vi.fn();
  const muteAllAudio = muteAllAudio$.subscribe((value) => {
    valueMock(value);
  });

  setAudioEnabled$.next(false);
  setAudioEnabled$.next(true);
  muteAllAudioSetting.setValue(false);
  muteAllAudioSetting.setValue(true);
  setAudioEnabled$.next(false);

  muteAllAudio.unsubscribe();

  expect(valueMock).toHaveBeenCalledTimes(4);
  expect(valueMock).toHaveBeenNthCalledWith(1, false); // startWith([false, muteAllAudioSetting.getValue()]);
  expect(valueMock).toHaveBeenNthCalledWith(2, true); // setAudioEnabled$.next(false);
  expect(valueMock).toHaveBeenNthCalledWith(3, false); // setAudioEnabled$.next(true);
  expect(valueMock).toHaveBeenNthCalledWith(4, true); // muteAllAudioSetting.setValue(true);
});
