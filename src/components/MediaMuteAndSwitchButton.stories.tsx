/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn, userEvent, waitFor, within, expect } from "storybook/test";
import { type JSX } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { MediaMuteAndSwitchButton } from "./MediaMuteAndSwitchButton";
import styles from "./MediaMuteAndSwitchButton.module.css";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";

const mediaDevices = new MediaDevices(globalScope, {
  controlledAudioDevices: false,
});

const meta = {
  component: MediaMuteAndSwitchButton,
  decorators: [
    (Story): JSX.Element => (
      <MediaDevicesContext value={mediaDevices}>
        <Story />
      </MediaDevicesContext>
    ),
  ],
} satisfies Meta<typeof MediaMuteAndSwitchButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "SomeMenu",
    iconsAndLabels: "audio",
    enabled: true,
    options: [
      { label: { type: "name", name: "Option 1" }, id: "1" },
      { label: { type: "name", name: "Option 2" }, id: "2" },
    ],
    selectedOption: "1",
    onMuteClick: fn(),
    onSelect: fn(),
  },
};

export const AudioMute: Story = {
  args: {
    ...Default.args,
    title: "Microphone",
    iconsAndLabels: "audio",
    enabled: false,
    options: [
      { label: { type: "name", name: "Microphone 1" }, id: "1" },
      { label: { type: "name", name: "Microphone 2" }, id: "2" },
    ],
    videoBlurEnabled: true,
    videoBlurToggleClick: fn(),
    selectedOption: "2",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // Both the mute button and the chevron trigger currently share the aria-label "Edit"
    // (both are TODO placeholders in the component). The mute button is first in the DOM.
    const muteButton = canvas.getByTestId("incall_mute");
    await userEvent.click(muteButton);
    await expect(args.onMuteClick).toHaveBeenCalled();
  },
};

export const AudioUnmute: Story = {
  args: {
    title: "Microphone",
    iconsAndLabels: "audio",
    enabled: true,
    options: [
      { label: { type: "name", name: "Microphone 1" }, id: "1" },
      { label: { type: "name", name: "Microphone 2" }, id: "2" },
    ],

    selectedOption: "2",
  },
};

export const VideoMute: Story = {
  args: {
    title: "Camera",
    iconsAndLabels: "video",
    enabled: false,
    options: [
      { label: { type: "name", name: "Camera 1" }, id: "1" },
      { label: { type: "name", name: "Camera 2" }, id: "2" },
    ],

    selectedOption: "1",
  },
};

export const VideoUnmute: Story = {
  args: {
    title: "Camera",
    iconsAndLabels: "video",
    enabled: true,
    options: [
      { label: { type: "name", name: "Camera 1" }, id: "1" },
      { label: { type: "name", name: "Camera 2" }, id: "2" },
    ],
    videoBlurEnabled: true,
    videoBlurToggleClick: fn(),
    selectedOption: "2",
  },
};

export const SpeakerAndMicrophoneSections: Story = {
  args: {
    ...Default.args,
    title: "Microphone",
    iconsAndLabels: "audio",
    enabled: true,
    options: [
      { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
      { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
    ],
    selectedOption: "mic1",
    outputOptions: [
      { label: { type: "default", name: "Built-in Output" }, id: "default" },
      { label: { type: "name", name: "Headset" }, id: "spk2" },
    ],
    selectedOutputOption: "default",
    onSelectOutput: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));

    const headset = await within(document.body).findByRole("menuitemradio", {
      name: "Headset",
    });
    await userEvent.click(headset);
    await expect(args.onSelectOutput).toHaveBeenCalledWith("spk2");
  },
};

export const OutputCannotBeChosen: Story = {
  args: {
    ...Default.args,
    title: "Microphone",
    iconsAndLabels: "audio",
    enabled: true,
    options: [
      { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
      { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
    ],
    selectedOption: "mic1",
    outputOptions: [
      { label: { type: "name", name: "Speakers" }, id: "spk1" },
      { label: { type: "name", name: "Headset" }, id: "spk2" },
    ],
    selectedOutputOption: "spk1",
    // No callback: the speakers are listed, but none can be picked.
    onSelectOutput: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));

    const speakers = await within(document.body).findByRole("menuitemradio", {
      name: "Speakers",
    });
    await expect(speakers).toHaveAttribute("aria-disabled", "true");
  },
};

export const OnlyOneDevice: Story = {
  args: {
    ...Default.args,
    title: "Microphone",
    iconsAndLabels: "audio",
    enabled: true,
    options: [{ label: { type: "name", name: "Microphone 1" }, id: "mic1" }],
    selectedOption: "mic1",
    outputOptions: [{ label: { type: "name", name: "Speakers" }, id: "spk1" }],
    selectedOutputOption: "spk1",
    onSelectOutput: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));

    // Shown rather than hidden, so the menu keeps its shape everywhere.
    const only = await within(document.body).findByRole("menuitemradio", {
      name: "Microphone 1",
    });
    await expect(only).toHaveAttribute("aria-disabled", "true");
  },
};

/**
 * A platform that enumerates no output devices and offers no way to choose one
 * — Safari. The section still names where audio is going, disabled, rather than
 * leaving a heading with nothing under it.
 */
export const OutputNotEnumerated: Story = {
  args: {
    ...Default.args,
    title: "Microphone",
    iconsAndLabels: "audio",
    enabled: true,
    options: [
      { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
      { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
    ],
    selectedOption: "mic1",
    outputOptions: [],
    selectedOutputOption: undefined,
    onSelectOutput: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));

    const speakers = await within(document.body).findByRole("menuitemradio", {
      name: "Default",
    });
    await expect(speakers).toHaveAttribute("aria-disabled", "true");
  },
};

/**
 * Walking the device list with the keyboard, all the way to the last entry.
 *
 * The level meter stands over the foot of the list, so a row scrolled flush to
 * the bottom edge arrives underneath it and can only half be read. Nothing in
 * the DOM says an element is covered, so this compares where the two were
 * actually drawn.
 */
export const KeyboardReachesEveryDevice: Story = {
  args: {
    ...Default.args,
    title: "Microphone",
    iconsAndLabels: "audio",
    enabled: true,
    // Enough of them that the list scrolls well past its own height, so that
    // arrowing back up has to scroll too — which is where the heading can hide
    // a row, as the meter can on the way down.
    options: Array.from({ length: 20 }, (_, i) => ({
      label: { type: "name" as const, name: `Microphone ${i + 1}` },
      id: `mic${i + 1}`,
    })),
    selectedOption: "mic1",
    outputOptions: Array.from({ length: 4 }, (_, i) => ({
      label: { type: "name" as const, name: `Speaker ${i + 1}` },
      id: `spk${i + 1}`,
    })),
    selectedOutputOption: "spk1",
    onSelectOutput: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));

    const meter = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `.${styles.stickyMeter}`,
      );
      if (element === null) throw new Error("the meter has not rendered yet");
      return element;
    });

    // Everything that is drawn over the scrolling list: a heading holds the top
    // while its section is in view, the meter holds the foot.
    const overlays = [
      meter,
      ...document.body.querySelectorAll<HTMLElement>(
        `.${styles.sectionHeading}`,
      ),
    ];
    const items = within(document.body).getAllByRole("menuitemradio");

    // Down to the last device, as someone reading the list would, and back up
    // again: a row can be hidden at either end.
    for (const key of ["{ArrowDown}", "{ArrowUp}"])
      for (let i = 0; i < items.length; i++) {
        await userEvent.keyboard(key);
        const focused = document.activeElement as HTMLElement;
        await expect(focused).toHaveRole("menuitemradio");
        // Nothing is drawn over the row the keyboard has just reached. Stated
        // as overlap rather than as an edge, because whether a heading is in
        // the way depends on whether its section is still on screen.
        await expect(overlapping(focused, overlays)).toBeLessThanOrEqual(1);
      }
  },
};

/**
 * A long list scrolled well into the microphones.
 *
 * The heading of the section you are in stays at the top of the list, so it is
 * always clear which kind of device the rows below are. It leaves with its own
 * section rather than stacking with the next one.
 */
export const HeadingsStayWhileScrolling: Story = {
  args: {
    ...Default.args,
    title: "Microphone",
    iconsAndLabels: "audio",
    enabled: true,
    options: Array.from({ length: 20 }, (_, i) => ({
      label: { type: "name" as const, name: `Microphone ${i + 1}` },
      id: `mic${i + 1}`,
    })),
    selectedOption: "mic1",
    outputOptions: Array.from({ length: 4 }, (_, i) => ({
      label: { type: "name" as const, name: `Speaker ${i + 1}` },
      id: `spk${i + 1}`,
    })),
    selectedOutputOption: "spk1",
    onSelectOutput: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));
    const menu = within(document.body);

    const list = document.body.querySelector<HTMLElement>(
      `.${styles.deviceList}`,
    )!;
    const group = await menu.findByRole("group", { name: "Microphone" });
    // By class, not role: the heading is aria-hidden decoration, because the
    // group it belongs to is what carries the name.
    const heading = group.querySelector<HTMLElement>(
      `.${styles.sectionHeading}`,
    )!;

    // Far enough in that the heading's own place in the list is well above the
    // top of the scrollport: it is only still on screen if it is stuck there.
    list.scrollTop +=
      group.getBoundingClientRect().top - list.getBoundingClientRect().top + 80;

    const scrollport = list.getBoundingClientRect();
    await expect(heading.getBoundingClientRect().top).toBeLessThanOrEqual(
      scrollport.top + 2,
    );
    await expect(heading.getBoundingClientRect().bottom).toBeGreaterThan(
      scrollport.top,
    );
    // And it keeps clear of the menu's frame, as the meter does.
    const frame = document.body
      .querySelector("[role='menu']")!
      .getBoundingClientRect();
    await expect(heading.getBoundingClientRect().left).toBeGreaterThan(
      frame.left,
    );
  },
};

/**
 * How far an element is covered, in pixels, by the most overlapping of others.
 *
 * Nothing in the DOM says an element is obscured, and an element scrolled flush
 * to an edge of its container looks no different there from one a sticky
 * heading is sitting on top of. The boxes are the only witness.
 */
function overlapping(element: Element, overlays: Element[]): number {
  const box = element.getBoundingClientRect();
  return overlays.reduce((worst, overlay) => {
    const over = overlay.getBoundingClientRect();
    const shared =
      Math.min(box.bottom, over.bottom) - Math.max(box.top, over.top);
    return Math.max(worst, shared);
  }, 0);
}
