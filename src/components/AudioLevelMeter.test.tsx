/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AudioLevelMeter } from "./AudioLevelMeter";

describe("AudioLevelMeter", () => {
  test("a missing microphone is named rather than drawn as silence", () => {
    render(<AudioLevelMeter state={{ type: "absent" }} />);
    expect(screen.getByTestId("mic_absent")).toHaveTextContent(
      /no microphone found/i,
    );
    // Bars resting at zero would read as a microphone that hears nothing,
    // which is a different thing and the one people act on.
    expect(screen.queryByRole("meter")).toBe(null);
  });

  test("a denied microphone renders a hint instead of the meter", () => {
    render(<AudioLevelMeter state={{ type: "denied" }} />);
    expect(screen.getByTestId("mic_level_denied")).toHaveTextContent(
      /microphone access is blocked/i,
    );
    // A hint replaces the meter rather than sitting next to a dead one.
    expect(screen.queryByRole("meter")).toBe(null);
  });

  test("level indicator greys out when the microphone is unavailable", () => {
    render(<AudioLevelMeter state={{ type: "unavailable" }} />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("data-unavailable", "true");
    expect(meter).toHaveAttribute("aria-valuetext", "Microphone unavailable");
  });

  test("level indicator reports its level to assistive technology", () => {
    const { rerender } = render(
      <AudioLevelMeter state={{ type: "active", level: 0 }} />,
    );
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "0");
    expect(meter).toHaveAttribute("aria-valuetext", "No sound detected");

    rerender(<AudioLevelMeter state={{ type: "active", level: 0.7 }} />);
    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      "Picking up sound",
    );
  });

  test("level indicator announces its state only while focused", async () => {
    const user = userEvent.setup();
    render(<AudioLevelMeter state={{ type: "active", level: 0.7 }} />);
    const meter = screen.getByRole("meter");

    // Nothing is announced until the user puts the meter in focus, so the
    // level does not talk over the rest of the menu.
    const announcer = meter.querySelector("[aria-live]");
    expect(announcer).toHaveAttribute("aria-live", "off");
    await user.tab();
    expect(meter).toHaveFocus();
    expect(announcer).toHaveAttribute("aria-live", "polite");
    expect(announcer).toHaveTextContent("Picking up sound");
    await user.tab();
    expect(announcer).toHaveAttribute("aria-live", "off");
  });
});
