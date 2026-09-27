/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

import { MicrophoneLevelMeter } from "./MicrophoneLevelMeter";
import { LEVEL_SCALE } from "../state/MicrophoneLevel";
import { constant } from "../state/Behavior";

describe("MicrophoneLevelMeter", () => {
  test("announces the level rather than relying on hue", () => {
    render(
      <MicrophoneLevelMeter state={{ type: "level", level$: constant(6) }} />,
    );

    const meter = screen.getByRole("meter", { name: "Microphone level" });
    expect(meter).toHaveAttribute("aria-valuenow", "6");
    expect(meter).toHaveAttribute("aria-valuemax", String(LEVEL_SCALE));
    expect(meter).toHaveAttribute("aria-valuetext", `6 of ${LEVEL_SCALE}`);
  });

  test("shows distinct messages for denied permission and no input device", () => {
    const denied = render(
      <MicrophoneLevelMeter state={{ type: "permission-denied" }} />,
    );
    expect(
      denied.getByText(/Microphone access is blocked/),
    ).toBeInTheDocument();
    expect(denied.queryByRole("meter")).toBeNull();

    const missing = render(
      <MicrophoneLevelMeter state={{ type: "no-device" }} />,
    );
    expect(missing.getByText(/No microphone found/)).toBeInTheDocument();
    expect(missing.queryByRole("meter")).toBeNull();
  });
});
