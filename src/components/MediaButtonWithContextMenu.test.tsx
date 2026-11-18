/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX } from "react";
import { TooltipProvider } from "@vector-im/compound-web";

import {
  MediaButtonWithContextMenu,
  useHoldMenuOpen,
} from "./MediaButtonWithContextMenu";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type MediaDevices } from "../state/MediaDevices";

function Held(): JSX.Element {
  const hold = useHoldMenuOpen();
  return (
    <>
      <button onClick={() => hold(true)}>Hold</button>
      <button onClick={() => hold(false)}>Release</button>
    </>
  );
}

function renderButton({
  requestDeviceNames = vi.fn(),
  onOpenChange,
}: {
  requestDeviceNames?: () => void;
  onOpenChange?: (open: boolean) => void;
} = {}): void {
  render(
    <TooltipProvider>
      <MediaDevicesContext
        value={{ requestDeviceNames } as unknown as MediaDevices}
      >
        <MediaButtonWithContextMenu
          muteButton={<button>Mute</button>}
          label="Options"
          title="Options menu"
          onOpenChange={onOpenChange}
        >
          <Held />
        </MediaButtonWithContextMenu>
      </MediaDevicesContext>
    </TooltipProvider>,
  );
}

describe("MediaButtonWithContextMenu", () => {
  test("draws the menu's content only while it is open", async () => {
    const onOpenChange = vi.fn();
    renderButton({ onOpenChange });
    screen.getByRole("button", { name: "Mute" });
    expect(screen.queryByRole("menu")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByRole("menu")).toBeVisible();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  test("requests device names when opened", async () => {
    const requestDeviceNames = vi.fn();
    renderButton({ requestDeviceNames });

    expect(requestDeviceNames).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(requestDeviceNames).toHaveBeenCalled();
  });

  test("stays open while held", async () => {
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Options" }));

    await userEvent.click(screen.getByRole("button", { name: "Hold" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
