/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, onTestFinished, test, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  within,
  type RenderResult,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX } from "react";
import { TooltipProvider } from "@vector-im/compound-web";

import {
  CameraContextMenu,
  type CameraContextMenuProps,
} from "./CameraContextMenu";
import { MediaButtonWithContextMenu } from "./MediaButtonWithContextMenu";
import { type BackgroundEffectGridItem } from "./BackgroundEffectGrid";
import { type MenuOptions } from "./DeviceMenu";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type MediaDevices } from "../state/MediaDevices";

const effects: BackgroundEffectGridItem[] = [
  { id: "none", kind: "none" },
  { id: "blur", kind: "blur" },
  { id: "image:arc", kind: "image", imageUrl: "" },
  { id: "image:glow", kind: "image", imageUrl: "" },
];

const cameras: MenuOptions[] = [
  { label: { type: "name", name: "Camera 1" }, id: "cam1" },
];

/** The menu as the camera's button opens it. */
function CameraMenu(props: CameraContextMenuProps): JSX.Element {
  return (
    <TooltipProvider>
      <MediaDevicesContext
        value={{ requestDeviceNames: () => {} } as unknown as MediaDevices}
      >
        <MediaButtonWithContextMenu
          muteButton={null}
          label="Camera"
          title="Camera source"
        >
          <CameraContextMenu {...props} />
        </MediaButtonWithContextMenu>
      </MediaDevicesContext>
    </TooltipProvider>
  );
}

function renderMenu(props: CameraContextMenuProps): RenderResult {
  return render(<CameraMenu {...props} />);
}

async function open(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Camera" }));
}

describe("CameraContextMenu", () => {
  test("shows numbered devices correctly", async () => {
    renderMenu({
      options: [
        { label: { type: "number", number: 1 }, id: "cam1" },
        { label: { type: "number", number: 2 }, id: "cam2" },
      ],
      selectedOption: "cam1",
    });

    await open();
    screen.getByRole("menuitemradio", { name: "Camera 1" });
    screen.getByRole("menuitemradio", { name: "Camera 2" });
  });

  test("uses the same selection pattern as the microphone and keeps the blur toggle", async () => {
    renderMenu({
      options: [
        { label: { type: "name", name: "Camera 1" }, id: "cam1" },
        { label: { type: "name", name: "Camera 2" }, id: "cam2" },
      ],
      selectedOption: "cam1",
      onSelect: vi.fn(),
      backgroundEffects: effects,
      selectedBackgroundEffect: "none",
      onSelectBackgroundEffect: vi.fn(),
    });

    await open();

    screen.getByRole("menuitemradio", { name: "Camera 1", checked: true });
    screen.getByRole("menuitemradio", { name: "Camera 2", checked: false });
    within(screen.getByRole("group", { name: "Background effects" })).getByRole(
      "menuitemradio",
      { name: "Blur" },
    );
  });

  test("background effects are one keyboard-operable labelled choice", async () => {
    const user = userEvent.setup();
    const onSelectBackgroundEffect = vi.fn();
    renderMenu({
      options: cameras,
      selectedOption: "cam1",
      onSelect: vi.fn(),
      backgroundEffects: effects,
      selectedBackgroundEffect: "none",
      onSelectBackgroundEffect,
    });

    await user.click(screen.getByRole("button", { name: "Camera" }));
    const section = screen.getByRole("group", { name: "Background effects" });
    within(section).getByRole("menuitemradio", { name: "None", checked: true });
    within(section).getByRole("menuitemradio", {
      name: "Background 1",
      checked: false,
    });

    const blur = within(section).getByRole("menuitemradio", { name: "Blur" });
    for (let i = 0; i < 6 && document.activeElement !== blur; i++)
      await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(blur);
    await user.keyboard("{Enter}");
    expect(onSelectBackgroundEffect).toHaveBeenCalledWith("blur");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  test("does not choose the effect already in force again", async () => {
    const onSelectBackgroundEffect = vi.fn();
    renderMenu({
      options: cameras,
      selectedOption: "cam1",
      backgroundEffects: effects,
      selectedBackgroundEffect: "blur",
      onSelectBackgroundEffect,
    });

    await open();
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Blur" }));
    expect(onSelectBackgroundEffect).not.toHaveBeenCalled();
  });

  test("added images are chosen like shipped ones", async () => {
    const onSelectBackgroundEffect = vi.fn();
    renderMenu({
      options: cameras,
      selectedOption: "cam1",
      backgroundEffects: [
        ...effects,
        { id: "added:mine", kind: "image", imageUrl: "" },
      ],
      selectedBackgroundEffect: "none",
      onSelectBackgroundEffect,
    });

    await open();
    const section = screen.getByRole("group", { name: "Background effects" });
    await userEvent.click(
      within(section).getByRole("menuitemradio", { name: "Background 3" }),
    );
    expect(onSelectBackgroundEffect).toHaveBeenCalledWith("added:mine");
  });

  test("adds the file chosen from the add tile, and stays open", async () => {
    const user = userEvent.setup();
    const onAddBackgroundImage = vi.fn();
    const pick = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    onTestFinished(() => pick.mockRestore());
    renderMenu({
      options: cameras,
      selectedOption: "cam1",
      backgroundEffects: effects,
      selectedBackgroundEffect: "none",
      onSelectBackgroundEffect: vi.fn(),
      onAddBackgroundImage,
    });

    await user.click(screen.getByRole("button", { name: "Camera" }));
    await user.click(screen.getByRole("menuitem", { name: "Add image" }));
    expect(pick).toHaveBeenCalled();
    // The picker takes the focus, which would otherwise close the menu.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const file = new File(["x"], "mine.png", { type: "image/png" });
    // What the picker hands back; the open menu blocks pointer events.
    fireEvent.change(
      document.querySelector<HTMLInputElement>("input[type=file]")!,
      { target: { files: [file] } },
    );
    expect(onAddBackgroundImage).toHaveBeenCalledWith(file);
    screen.getByRole("menuitemradio", { name: "None", checked: true });

    // The picker is done, so the menu closes as usual again.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("shows a refusal until it is dismissed", async () => {
    // jsdom lays nothing out, so has nothing to scroll.
    const scroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    onTestFinished(() => {
      Element.prototype.scrollIntoView = scroll;
    });
    const onDismiss = vi.fn();
    renderMenu({
      options: cameras,
      selectedOption: "cam1",
      backgroundEffects: effects,
      selectedBackgroundEffect: "blur",
      onSelectBackgroundEffect: vi.fn(),
      onAddBackgroundImage: vi.fn(),
      backgroundEffectNotice: "Background effects run slowly",
      backgroundImageRefusal: "That file is not a supported image",
      onDismissBackgroundImageRefusal: onDismiss,
    });

    await open();
    expect(
      screen.getByText("That file is not a supported image"),
    ).toBeVisible();
    // In place of the notice, and nothing else changes.
    expect(screen.queryByText("Background effects run slowly")).toBeNull();
    screen.getByRole("menuitemradio", { name: "Blur", checked: true });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  test("offers the background effects in a phone's drawer", async () => {
    const userAgent = vi
      .spyOn(navigator, "userAgent", "get")
      .mockReturnValue("Mozilla/5.0 (Linux; Android 14)");
    onTestFinished(() => userAgent.mockRestore());
    const onSelectBackgroundEffect = vi.fn();
    renderMenu({
      options: cameras,
      selectedOption: "cam1",
      backgroundEffects: effects,
      selectedBackgroundEffect: "none",
      onSelectBackgroundEffect,
    });

    await open();
    const section = screen.getByRole("group", { name: "Background effects" });
    // A click alone: the drawer's drag handling reads layout jsdom lacks.
    fireEvent.click(
      within(section).getByRole("menuitemradio", { name: "Background 2" }),
    );
    expect(onSelectBackgroundEffect).toHaveBeenCalledWith("image:glow");
  });
});
