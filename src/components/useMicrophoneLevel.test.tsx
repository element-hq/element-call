/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, test } from "vitest";
import { renderHook } from "@testing-library/react";

import { useMicrophoneLevel } from "./useMicrophoneLevel";
import { restoreAudioCapture, stubAudioCapture } from "../utils/test";

// The capture itself, and releasing it, belong to observeMicrophoneState$ and
// are covered in src/state/MicrophoneLevel.test.ts. What is left here is the
// bridging: when the hook watches, and what it reports before it has an answer.
describe("useMicrophoneLevel", () => {
  afterEach(restoreAudioCapture);

  test("holds no capture while the meter is not shown", () => {
    const capture = stubAudioCapture();

    renderHook(() => useMicrophoneLevel("mic1", false));

    expect(capture.getUserMedia).not.toHaveBeenCalled();
  });

  test("starts from nothing rather than the previous device's level", () => {
    const capture = stubAudioCapture();

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useMicrophoneLevel(id, true),
      { initialProps: { id: "mic1" } },
    );
    capture.grant();

    rerender({ id: "mic2" });

    // No level carried over: the meter reads the new device or nothing at all.
    expect(result.current).toEqual({ type: "level", level: 0 });
  });
});
