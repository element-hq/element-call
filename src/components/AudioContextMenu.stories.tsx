/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn, userEvent, waitFor, within, expect } from "storybook/test";
import { useEffect, type FC, type JSX, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AudioContextMenu,
  type AudioContextMenuProps,
} from "./AudioContextMenu";
import { MediaButtonWithContextMenu } from "./MediaButtonWithContextMenu";
import { MicButton } from "../button";
import deviceMenuStyles from "./DeviceMenu.module.css";
import meterStyles from "./MicrophoneLevelMeter.module.css";
import { outlineWidth, WithACallArea } from "./DeviceMenuStoryFixtures";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";

const mediaDevices = new MediaDevices(globalScope, {
  controlledAudioDevices: false,
});

/** Supplies a microphone, a wavering tone: a story's invented device ids match no hardware. */
const WithAMicrophone: FC<{ children: ReactNode }> = ({ children }) => {
  useEffect(() => {
    const context = new AudioContext();
    const microphone = context.createMediaStreamDestination();
    const tone = context.createOscillator();
    const loudness = context.createGain();
    // Wavers between a third and two thirds of full scale, so it reads as live.
    const swing = context.createOscillator();
    const depth = context.createGain();
    loudness.gain.value = 0.25;
    depth.gain.value = 0.2;
    swing.frequency.value = 0.6;
    tone.frequency.value = 220;
    swing.connect(depth).connect(loudness.gain);
    tone.connect(loudness).connect(microphone);
    tone.start();
    swing.start();

    const devices = navigator.mediaDevices;
    const openedForReal = devices.getUserMedia.bind(devices);
    const opened = Promise.resolve(microphone.stream);
    // A fresh clone each time, so a caller stopping its tracks doesn't end the next.
    devices.getUserMedia = async (): Promise<MediaStream> =>
      (await opened).clone();

    return (): void => {
      devices.getUserMedia = openedForReal;
      tone.stop();
      swing.stop();
      void context.close();
    };
  }, []);

  return <>{children}</>;
};

/** The menu as the microphone's button opens it, beside its mute button. */
function AudioMenu({
  enabled = true,
  onMuteClick,
  ...menu
}: AudioContextMenuProps & {
  enabled?: boolean;
  onMuteClick?: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <MediaButtonWithContextMenu
      muteButton={
        <MicButton
          enabled={enabled}
          onClick={onMuteClick}
          data-testid="incall_mute"
        />
      }
      label={t("settings.devices.microphone")}
      title={t("settings.devices.mic_source")}
    >
      <AudioContextMenu {...menu} />
    </MediaButtonWithContextMenu>
  );
}

const meta = {
  component: AudioMenu,
  decorators: [
    (Story): JSX.Element => (
      <MediaDevicesContext value={mediaDevices}>
        <WithACallArea>
          <WithAMicrophone>
            <Story />
          </WithAMicrophone>
        </WithACallArea>
      </MediaDevicesContext>
    ),
  ],
} satisfies Meta<typeof AudioMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// By place: Compound's section heading is aria-hidden, as its group carries
// the name.
const SECTION_HEADING = "[role='group'] > [aria-hidden]";

export const Default: Story = {
  args: {
    enabled: true,
    options: [
      { label: { type: "name", name: "Option 1" }, id: "1" },
      { label: { type: "name", name: "Option 2" }, id: "2" },
    ],
    selectedOption: "1",
    // The footer always passes an output list to the audio menu.
    outputOptions: [
      { label: { type: "default", name: "Built-in Output" }, id: "default" },
      { label: { type: "name", name: "Headset" }, id: "spk2" },
    ],
    selectedOutputOption: "default",
    onSelectOutput: fn(),
    onMuteClick: fn(),
    onSelect: fn(),
  },
};

export const AudioMute: Story = {
  args: {
    ...Default.args,
    enabled: false,
    options: [
      { label: { type: "name", name: "Microphone 1" }, id: "1" },
      { label: { type: "name", name: "Microphone 2" }, id: "2" },
    ],
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
    ...Default.args,
    enabled: true,
    options: [
      { label: { type: "name", name: "Microphone 1" }, id: "1" },
      { label: { type: "name", name: "Microphone 2" }, id: "2" },
    ],
    selectedOption: "2",
  },
};

export const SpeakerAndMicrophoneSections: Story = {
  args: {
    ...Default.args,
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

    // A few devices fit, so the list doesn't scroll.
    const list = document.body.querySelector<HTMLElement>(
      `.${deviceMenuStyles.deviceList}`,
    )!;
    await expect(list.scrollHeight).toBe(list.clientHeight);

    // Each section is headed by its own edge-to-edge rule, with no separator.
    const menu = document.body.querySelector("[role='menu']")!;
    await expect(
      document.body.querySelectorAll("[role='separator']"),
    ).toHaveLength(0);
    const headings =
      document.body.querySelectorAll<HTMLElement>(SECTION_HEADING);
    await expect(headings).toHaveLength(2);
    const frame = menu.getBoundingClientRect();
    for (const heading of headings) {
      const rule = heading.querySelector("h3")!;
      await expect(
        Number.parseFloat(getComputedStyle(rule).borderBottomWidth),
      ).toBeGreaterThan(0);
      // Edge to edge, within the frame.
      const box = rule.getBoundingClientRect();
      await expect(box.left - frame.left).toBeLessThanOrEqual(2);
      await expect(frame.right - box.right).toBeLessThanOrEqual(2);
    }

    // The first device sits further below the rule than from the menu's edge.
    // Asserted as a relationship, not pixels: the asymmetry is the design.
    const control = document.body.querySelector("input[type='radio']")!;
    const ruleBottom = headings[0]
      .querySelector("h3")!
      .getBoundingClientRect().bottom;
    const box = control.getBoundingClientRect();
    await expect(box.top - ruleBottom).toBeGreaterThan(box.left - frame.left);

    // And a section stands further from the one above than from its own first
    // device.
    const groups = document.body.querySelectorAll("[role='group']");
    const speakers = groups[0].querySelectorAll("input[type='radio']");
    const lastSpeaker = speakers[speakers.length - 1].getBoundingClientRect();
    const nextHeading = groups[1]!.querySelector("h3")!.getBoundingClientRect();
    await expect(nextHeading.top - lastSpeaker.bottom).toBeGreaterThan(
      box.top - ruleBottom,
    );
  },
};

/** A long name wraps rather than widening the menu, which design sets. */
export const LongDeviceNameWraps: Story = {
  args: {
    ...SpeakerAndMicrophoneSections.args,
    outputOptions: [
      {
        label: {
          type: "name",
          name: "Logitech BRIO 4K Ultra HD Pro Business Webcam Speakers (046d:085e)",
        },
        id: "long",
      },
      { label: { type: "name", name: "Headset" }, id: "spk2" },
    ],
    selectedOutputOption: "long",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));
    const body = within(document.body);
    const long = await body.findByRole("menuitemradio", { name: /Logitech/ });
    const short = await body.findByRole("menuitemradio", { name: "Headset" });

    const menu = document.body.querySelector("[role='menu']")!;
    await expect(Math.round(menu.getBoundingClientRect().width)).toBe(296);
    await expect(long.getBoundingClientRect().height).toBeGreaterThan(
      short.getBoundingClientRect().height,
    );
  },
};

export const OutputCannotBeChosen: Story = {
  args: {
    ...Default.args,
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

    // Shown, disabled, rather than hidden.
    const only = await within(document.body).findByRole("menuitemradio", {
      name: "Microphone 1",
    });
    await expect(only).toHaveAttribute("aria-disabled", "true");
  },
};

/** A requested device hasn't arrived: nothing in either section can be picked. */
export const SelectionSettling: Story = {
  args: {
    ...Default.args,
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
    onSelectOutput: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));
    const menu = within(document.body);

    // selectedOption never changes, so the request stays in flight.
    await userEvent.click(
      await menu.findByRole("menuitemradio", { name: "Microphone 2" }),
    );

    await expect(await menu.findByLabelText("Activating…")).toBeVisible();
    for (const item of menu.getAllByRole("menuitemradio"))
      await expect(item).toHaveAttribute("aria-disabled", "true");
  },
};

/**
 * The ring shows for keyboard focus only. Asserted on the painted outline:
 * asserting data-focus-source would still pass with the CSS rule deleted.
 */
export const KeyboardFocusRing: Story = {
  args: {
    ...Default.args,
    enabled: true,
    options: [
      { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
      { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
    ],
    selectedOption: "mic1",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));
    const menu = within(document.body);
    const first = await menu.findByRole("menuitemradio", {
      name: "Microphone 1",
    });

    // Opened by pointer: no ring, even though Radix has moved focus.
    await expect(outlineWidth(first)).toBe(0);

    await userEvent.keyboard("{ArrowDown}");
    const focused = document.activeElement as HTMLElement;
    await expect(focused).toHaveRole("menuitemradio");
    await expect(outlineWidth(focused)).toBeGreaterThan(0);

    // And the pointer takes it away again.
    await userEvent.hover(first);
    await expect(outlineWidth(document.activeElement as HTMLElement)).toBe(0);
  },
};

/** The list scrolls; the meter stays at the foot of the microphone section. */
export const ManyDevices: Story = {
  args: {
    ...Default.args,
    enabled: true,
    options: Array.from({ length: 20 }, (_, i) => ({
      label: { type: "name" as const, name: `Microphone ${i + 1}` },
      id: `mic${i + 1}`,
    })),
    selectedOption: "mic1",
    outputOptions: Array.from({ length: 6 }, (_, i) => ({
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

    // The meter's box rather than its level: without a fake microphone (as on
    // WebKit) the meter shows a message instead of a level.
    const list = document.body.querySelector<HTMLElement>(
      `.${deviceMenuStyles.deviceList}`,
    )!;
    const sticky = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `.${meterStyles.meter}`,
      );
      if (element === null) throw new Error("the meter has not rendered yet");
      return element;
    });
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);

    // Scrolled so the microphone section starts at the top: only there does a
    // pinned meter differ from one that is simply last.
    const group = await menu.findByRole("group", { name: "Microphone" });
    list.scrollTop +=
      group.getBoundingClientRect().top - list.getBoundingClientRect().top;
    await expect(list.scrollTop + list.clientHeight).toBeLessThan(
      list.scrollHeight,
    );

    const scrollport = list.getBoundingClientRect();
    const pinned = sticky.getBoundingClientRect();
    await expect(pinned.bottom).toBeLessThanOrEqual(scrollport.bottom + 1);
    await expect(pinned.top).toBeGreaterThanOrEqual(scrollport.top - 1);

    // The whole menu is on screen, not bounded by the document.
    const frame = document.body
      .querySelector("[role='menu']")!
      .getBoundingClientRect();
    await expect(frame.top).toBeGreaterThanOrEqual(0);
    await expect(frame.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
  },
};

/** Safari lists no outputs: a disabled, selected Default stands in. */
export const OutputNotEnumerated: Story = {
  args: {
    ...Default.args,
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

/** The meter's icon shares the radio controls' centre line; only a real browser lays this out. */
export const MeterAlignsWithTheDeviceRows: Story = {
  args: {
    ...Default.args,
    enabled: true,
    options: [
      { label: { type: "name", name: "Microphone 1" }, id: "mic1" },
      { label: { type: "name", name: "Microphone 2" }, id: "mic2" },
    ],
    selectedOption: "mic1",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));

    const menu = document.body.querySelector("[role='menu']")!;
    const radio = menu.querySelector("input[type='radio']")!;
    const icon = await waitFor(() => {
      const element = document.body.querySelector(`.${meterStyles.icon}`);
      if (element === null) throw new Error("the meter has not rendered yet");
      return element;
    });

    // A pixel of slack, for subpixel layout.
    await expect(Math.abs(centre(icon) - centre(radio))).toBeLessThanOrEqual(1);
  },
};

/** Inline-axis centre of an element. */
function centre(element: Element): number {
  const box = element.getBoundingClientRect();
  return box.left + box.width / 2;
}

/** Every row the keyboard reaches is fully visible, not under a heading or the meter. */
export const KeyboardReachesEveryDevice: Story = {
  args: {
    ...Default.args,
    enabled: true,
    // Enough to scroll both ways, so either end can hide a row.
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
        `.${meterStyles.meter}`,
      );
      if (element === null) throw new Error("the meter has not rendered yet");
      return element;
    });

    // Drawn over the list: the sticky headings and the meter.
    const overlays = [
      meter,
      ...document.body.querySelectorAll<HTMLElement>(SECTION_HEADING),
    ];
    const items = within(document.body).getAllByRole("menuitemradio");

    // Down to the last device and back up.
    for (const key of ["{ArrowDown}", "{ArrowUp}"])
      for (let i = 0; i < items.length; i++) {
        await userEvent.keyboard(key);
        const focused = document.activeElement as HTMLElement;
        await expect(focused).toHaveRole("menuitemradio");
        // Checked as overlap: a heading only covers rows while its section is on
        // screen.
        await expect(overlapping(focused, overlays)).toBeLessThanOrEqual(1);
      }
  },
};

/** A section's heading stays at the top while the section is in view, and leaves with it. */
export const HeadingsStayWhileScrolling: Story = {
  args: {
    ...Default.args,
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
      `.${deviceMenuStyles.deviceList}`,
    )!;
    const group = await menu.findByRole("group", { name: "Microphone" });
    const heading = group.querySelector<HTMLElement>(":scope > [aria-hidden]")!;

    // Far enough that the heading is only on screen if it is stuck there.
    list.scrollTop +=
      group.getBoundingClientRect().top - list.getBoundingClientRect().top + 80;

    const scrollport = list.getBoundingClientRect();
    await expect(heading.getBoundingClientRect().top).toBeLessThanOrEqual(
      scrollport.top + 2,
    );
    await expect(heading.getBoundingClientRect().bottom).toBeGreaterThan(
      scrollport.top,
    );
  },
};

/** How far the most overlapping of `overlays` covers `element`, in px. */
function overlapping(element: Element, overlays: Element[]): number {
  const box = element.getBoundingClientRect();
  return overlays.reduce((worst, overlay) => {
    const over = overlay.getBoundingClientRect();
    const shared =
      Math.min(box.bottom, over.bottom) - Math.max(box.top, over.top);
    return Math.max(worst, shared);
  }, 0);
}
