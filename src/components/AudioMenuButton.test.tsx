/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";

import { AudioMenuButton } from "./AudioMenuButton";
import {
  type AudioMenuViewModel,
  type DeviceMenuSnapshot,
} from "./MediaMenuViewModel";
import { createStaticViewModel } from "../state/ViewModel";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type MediaDevices } from "../state/MediaDevices";

function audioMenu(device: Partial<DeviceMenuSnapshot>): AudioMenuViewModel {
  return {
    ...createStaticViewModel<DeviceMenuSnapshot>({
      enabled: true,
      busy: false,
      toggle: vi.fn(),
      options: [{ id: "mic1", label: { type: "name", name: "Microphone 1" } }],
      selected: "mic1",
      select: vi.fn(),
      ...device,
    }),
    kind: "audio",
    output: createStaticViewModel({
      options: [],
      selected: undefined,
      select: undefined,
    }),
  };
}

function renderButton(vm: AudioMenuViewModel): void {
  render(
    <TooltipProvider>
      <MediaDevicesContext
        value={{ requestDeviceNames: () => {} } as unknown as MediaDevices}
      >
        <AudioMenuButton vm={vm} size="lg" />
      </MediaDevicesContext>
    </TooltipProvider>,
  );
}

describe("AudioMenuButton", () => {
  test.each([
    [true, "Mute microphone"],
    [false, "Unmute microphone"],
  ])("labels the mute button by its state (%s)", (enabled, name) => {
    renderButton(audioMenu({ enabled }));
    screen.getByRole("switch", { name });
  });

  test("mutes from the mute button, not the menu", async () => {
    const toggle = vi.fn();
    renderButton(audioMenu({ toggle }));
    await userEvent.click(
      screen.getByRole("switch", { name: "Mute microphone" }),
    );
    expect(toggle).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("disables the mute button while busy", () => {
    renderButton(audioMenu({ busy: true }));
    const mute = screen.getByRole("switch", { name: "Mute microphone" });
    expect(mute).toHaveAttribute("aria-disabled", "true");
    expect(mute).toHaveAttribute("aria-busy", "true");
  });

  test("opens the microphone's menu", async () => {
    renderButton(audioMenu({}));
    await userEvent.click(screen.getByRole("button", { name: "Microphone" }));
    screen.getByRole("menuitemradio", { name: "Microphone 1", checked: true });
  });

  test("is a plain mute button without microphones to offer", () => {
    renderButton(audioMenu({ options: [], toggle: undefined }));
    expect(screen.queryByRole("button", { name: "Microphone" })).toBeNull();
    expect(screen.getByTestId("incall_mute")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
