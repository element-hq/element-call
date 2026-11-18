/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, onTestFinished, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";
import { type BehaviorSubject } from "rxjs";

import { CameraMenuButton } from "./CameraMenuButton";
import {
  type BackgroundEffectsMenuSnapshot,
  type BackgroundImageRefusal,
  type CameraMenuViewModel,
  type DeviceMenuSnapshot,
} from "./MediaMenuViewModel";
import { createStaticViewModel } from "../state/ViewModel";
import { constant } from "../state/Behavior";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type MediaDevices } from "../state/MediaDevices";

function cameraMenu(
  device: Partial<DeviceMenuSnapshot> = {},
  effects: Partial<BackgroundEffectsMenuSnapshot> = {},
): CameraMenuViewModel {
  return {
    ...createStaticViewModel<DeviceMenuSnapshot>({
      enabled: true,
      busy: false,
      toggle: vi.fn(),
      options: [{ id: "cam1", label: { type: "name", name: "Camera 1" } }],
      selected: "cam1",
      select: vi.fn(),
      ...device,
    }),
    kind: "video",
    backgroundEffects: createStaticViewModel<BackgroundEffectsMenuSnapshot>({
      selected: "none",
      available: [
        { id: "none", kind: "none" },
        { id: "blur", kind: "blur" },
      ],
      notice: undefined,
      settling: false,
      imageRefusal: undefined,
      select: vi.fn(),
      addImage: vi.fn(),
      remove: undefined,
      ...effects,
    }),
    cameraTrack$: constant(null),
  };
}

function renderButton(vm: CameraMenuViewModel): void {
  render(
    <TooltipProvider>
      <MediaDevicesContext
        value={{ requestDeviceNames: () => {} } as unknown as MediaDevices}
      >
        <CameraMenuButton vm={vm} size="lg" />
      </MediaDevicesContext>
    </TooltipProvider>,
  );
}

async function open(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Camera" }));
}

describe("CameraMenuButton", () => {
  test.each([
    [true, "Stop video"],
    [false, "Start video"],
  ])("labels the mute button by its state (%s)", (enabled, name) => {
    renderButton(cameraMenu({ enabled }));
    screen.getByRole("switch", { name });
  });

  test("disables the mute button while busy", async () => {
    const toggle = vi.fn();
    renderButton(cameraMenu({ busy: true, toggle }));
    const mute = screen.getByRole("switch", { name: "Stop video" });
    expect(mute).toHaveAttribute("aria-disabled", "true");
    expect(mute).toHaveAttribute("aria-busy", "true");
    await userEvent.click(mute);
    expect(toggle).not.toHaveBeenCalled();
  });

  test("says in words why effects can't run here", async () => {
    renderButton(cameraMenu({}, { notice: "unavailable", select: undefined }));
    await open();
    screen.getByText("Background effects are not supported on this platform.");
  });

  test("a refusal can be dismissed and does not outlive the menu", async () => {
    // jsdom lays nothing out, so has nothing to scroll.
    const scroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    onTestFinished(() => {
      Element.prototype.scrollIntoView = scroll;
    });
    const vm = cameraMenu();
    const refusal$ = vm.backgroundEffects.imageRefusal$ as BehaviorSubject<
      BackgroundImageRefusal | undefined
    >;
    renderButton(vm);
    await open();

    act(() => refusal$.next({ reason: "not-an-image" }));
    expect(
      screen.getByText("That file is not a supported image"),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("That file is not a supported image")).toBeNull();

    // The next refusal is shown, even if it says the same.
    act(() => refusal$.next({ reason: "not-an-image" }));
    expect(
      screen.getByText("That file is not a supported image"),
    ).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await open();
    expect(screen.queryByText("That file is not a supported image")).toBeNull();
  });

  test("is a plain mute button without cameras to offer", () => {
    renderButton(cameraMenu({ options: [], toggle: undefined }));
    expect(screen.queryByRole("button", { name: "Camera" })).toBeNull();
    expect(screen.getByTestId("incall_videomute")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
