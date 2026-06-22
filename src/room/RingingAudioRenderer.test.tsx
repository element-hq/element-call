/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, type MockedFunction, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";

import { useAudioContext } from "../useAudioContext";
import { createRingingMedia } from "../state/media/RingingMediaViewModel";
import { alice, aliceId } from "../utils/test-fixtures";
import { constant } from "../state/Behavior";
import { RingingAudioRenderer } from "./RingingAudioRenderer";
import { prefetchSounds } from "../soundUtils";

vi.mock("../useAudioContext");
vi.mock("../soundUtils");

test("ringtone plays on loop while ringing", () => {
  (prefetchSounds as MockedFunction<typeof prefetchSounds>).mockResolvedValue({
    sound: new ArrayBuffer(0),
  });
  const endSoundLooping = vi.fn().mockReturnValue(Promise.resolve());
  const playSoundLooping = vi.fn().mockReturnValue(endSoundLooping);
  (useAudioContext as MockedFunction<typeof useAudioContext>).mockReturnValue({
    playSound: vi.fn(),
    playSoundLooping,
    soundDuration: {},
  });

  const pickupState$ = new BehaviorSubject<"ringing" | "timeout" | "decline">(
    "ringing",
  );
  const vm = createRingingMedia({
    id: aliceId,
    userId: alice.userId,
    displayName$: constant("Alice"),
    mxcAvatarUrl$: constant(undefined),
    intent: "audio",
    pickupState$,
  });

  // Begin ringing
  render(<RingingAudioRenderer vm={vm} muted={false} />);
  expect(playSoundLooping).toHaveBeenCalledExactlyOnceWith(
    "ringtone",
    expect.any(Number),
  );
  expect(endSoundLooping).not.toHaveBeenCalled();
  vi.clearAllMocks();

  // End ringing
  act(() => pickupState$.next("decline"));
  expect(playSoundLooping).not.toHaveBeenCalled();
  expect(endSoundLooping).toHaveBeenCalledExactlyOnceWith();
});
