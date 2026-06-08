/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";

import { MicButton, VideoButton } from "./Button";

describe("MicButton", () => {
  test("calls onClick when not busy", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <MicButton enabled={true} onClick={onClick} />
      </TooltipProvider>,
    );

    const button = screen.getByRole("switch");
    await user.click(button);

    expect(onClick).toHaveBeenCalled();
  });

  test("does not call onClick when busy", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <MicButton enabled={true} busy={true} onClick={onClick} />
      </TooltipProvider>,
    );

    const button = screen.getByRole("switch");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <MicButton enabled={true} disabled={true} onClick={onClick} />
      </TooltipProvider>,
    );

    const button = screen.getByRole("switch");
    expect(button).toHaveAttribute("aria-disabled", "true");

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("VideoButton", () => {
  test("calls onClick when not busy", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <VideoButton enabled={true} onClick={onClick} />
      </TooltipProvider>,
    );

    const button = screen.getByRole("switch");
    await user.click(button);

    expect(onClick).toHaveBeenCalled();
  });

  test("does not call onClick when busy", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <VideoButton enabled={true} busy={true} onClick={onClick} />
      </TooltipProvider>,
    );

    const button = screen.getByRole("switch");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <VideoButton enabled={true} disabled={true} onClick={onClick} />
      </TooltipProvider>,
    );

    const button = screen.getByRole("switch");
    expect(button).toHaveAttribute("aria-disabled", "true");

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
