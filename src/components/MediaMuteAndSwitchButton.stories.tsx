/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn, userEvent, waitFor, within, expect } from "storybook/test";
import { useEffect, useState, type FC, type JSX, type ReactNode } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { MediaMuteAndSwitchButton } from "./MediaMuteAndSwitchButton";
import styles from "./MediaMuteAndSwitchButton.module.css";
import meterStyles from "./MicrophoneLevelMeter.module.css";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { RootElementProvider } from "../RootElementContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";

const mediaDevices = new MediaDevices(globalScope, {
  controlledAudioDevices: false,
});

/**
 * Gives these stories a microphone to read.
 *
 * The menu opens a capture of whichever device it has been told is selected,
 * and the devices in a story are invented: asking for one by an id no hardware
 * answers to fails, and the meter reports that — correctly — as there being no
 * microphone. So the story provides one rather than borrowing the machine's: a
 * wavering tone played into a real MediaStream, which the meter then runs its
 * own analyser over. Nothing here stands in for the meter itself.
 */
const WithAMicrophone: FC<{ children: ReactNode }> = ({ children }) => {
  useEffect(() => {
    const context = new AudioContext();
    const microphone = context.createMediaStreamDestination();
    const tone = context.createOscillator();
    const loudness = context.createGain();
    // Swinging between about a third and two thirds of the range, so the meter
    // reads as something live rather than as a level someone pinned there.
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
    // A fresh clone each time, so that a caller stopping its tracks when it is
    // done does not take the microphone away from the next one.
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

/**
 * Gives these stories the call area the menu belongs to.
 *
 * The menu sizes its device list against the space Element Call is drawn in,
 * and takes that from a provider. Without one it falls back to the document
 * body — which in a story is the whole of Storybook's frame, so the list is
 * bounded by something far larger than the story it is drawn in and runs off
 * the top of the canvas. Supplying a root is the same courtesy as supplying the
 * devices: the story stands in for the call, so it has to say how big it is.
 */
const WithACallArea: FC<{ children: ReactNode }> = ({ children }) => {
  const [callArea, setCallArea] = useState<HTMLElement | null>(null);
  return (
    <div
      ref={setCallArea}
      style={{
        // The size of a call, not of a thumbnail: the device list is bounded to
        // a share of this, so a small area makes even a two-device menu scroll,
        // which no real call does. Tall enough to leave the menu room to open
        // upward and still be wholly on screen in the story's frame.
        blockSize: 720,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      {callArea !== null && (
        <RootElementProvider value={callArea}>{children}</RootElementProvider>
      )}
    </div>
  );
};

const meta = {
  component: MediaMuteAndSwitchButton,
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
    // The audio menu always has a speaker section: the footer hands it an
    // output list whenever it draws the chevron at all, so a microphone menu
    // with no speakers in it is a shape nothing in the app produces. Set here
    // rather than in each story, since the others build on these.
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
    ...Default.args,
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

    // A handful of devices fits: only a list longer than the space it is given
    // scrolls, and a menu that scrolled at four devices would be bounded by
    // something far smaller than the call it is drawn in.
    const list = document.body.querySelector<HTMLElement>(
      `.${styles.deviceList}`,
    )!;
    await expect(list.scrollHeight).toBe(list.clientHeight);

    // Each section is headed by its own rule, running the full width of the
    // menu rather than inset — and nothing divides the sections besides.
    const menu = document.body.querySelector("[role='menu']")!;
    await expect(
      document.body.querySelectorAll("[role='separator']"),
    ).toHaveLength(0);
    const headings = document.body.querySelectorAll<HTMLElement>(
      `.${styles.sectionHeading}`,
    );
    await expect(headings).toHaveLength(2);
    const frame = menu.getBoundingClientRect();
    for (const heading of headings) {
      const rule = heading.querySelector("h3")!;
      await expect(
        Number.parseFloat(getComputedStyle(rule).borderBottomWidth),
      ).toBeGreaterThan(0);
      // Edge to edge, stopping only where the menu's frame is drawn.
      const box = rule.getBoundingClientRect();
      await expect(box.left - frame.left).toBeLessThanOrEqual(2);
      await expect(frame.right - box.right).toBeLessThanOrEqual(2);
    }

    // A section's first device sits further below the rule than it does from
    // the menu's edge. Stated as the relationship rather than a number: what
    // the design asks for is the asymmetry, and Compound's own heading margin
    // alone would make the two equal.
    const control = document.body.querySelector("input[type='radio']")!;
    const ruleBottom = headings[0]
      .querySelector("h3")!
      .getBoundingClientRect().bottom;
    const box = control.getBoundingClientRect();
    await expect(box.top - ruleBottom).toBeGreaterThan(box.left - frame.left);

    // And one section stands further from the one above it than a heading does
    // from its own first device — again the relationship, not a number.
    const groups = document.body.querySelectorAll("[role='group']");
    const speakers = groups[0].querySelectorAll("input[type='radio']");
    const lastSpeaker = speakers[speakers.length - 1].getBoundingClientRect();
    const nextHeading = groups[1]!.querySelector("h3")!.getBoundingClientRect();
    await expect(nextHeading.top - lastSpeaker.bottom).toBeGreaterThan(
      box.top - ruleBottom,
    );
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
 * A device has been asked for and has not arrived. Nothing in either section
 * can be picked until it does, so a second request cannot overtake the first.
 */
export const SelectionSettling: Story = {
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
    onSelectOutput: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));
    const menu = within(document.body);

    // The story never changes `selectedOption`, which is what a device that has
    // not taken effect yet looks like from here.
    await userEvent.click(
      await menu.findByRole("menuitemradio", { name: "Microphone 2" }),
    );

    await expect(await menu.findByLabelText("Activating…")).toBeVisible();
    for (const item of menu.getAllByRole("menuitemradio"))
      await expect(item).toHaveAttribute("aria-disabled", "true");
  },
};

/**
 * The focus ring belongs to the keyboard. Radix focuses whatever the pointer is
 * over, so a ring that followed focus alone would trail the mouse.
 *
 * Asserted on the painted outline rather than on `data-focus-modality`: the
 * attribute is what the stylesheet keys off, so asserting it would pass even
 * with the rule deleted.
 */
export const KeyboardFocusRing: Story = {
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

/**
 * More devices than the menu can show. The list scrolls, and the meter stays at
 * the foot of the Microphone section rather than scrolling away with it.
 */
export const ManyDevices: Story = {
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

    // The scroll container and the opaque sticky wrapper, named rather than
    // walked: the nesting between them is layout, and it moves. The wrapper
    // rather than the meter itself, because this story is about where the meter
    // sits, not what it reads — without a fake microphone, as on WebKit, it
    // says it has no permission instead of showing a level.
    const list = document.body.querySelector<HTMLElement>(
      `.${styles.deviceList}`,
    )!;
    const sticky = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `.${styles.stickyMeter}`,
      );
      if (element === null) throw new Error("the meter has not rendered yet");
      return element;
    });
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);

    // Scrolled so the Microphone section starts at the top of the scrollport.
    // Its devices then run past the bottom, which is the position that tells a
    // pinned meter from one that simply happens to be the last element: at the
    // very bottom of the list the two look identical.
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

    // The whole menu is on screen. It opens upward from the foot of the call,
    // so a list bounded by something bigger than the call — the document, say —
    // runs off the top and takes the speakers with it.
    const frame = document.body
      .querySelector("[role='menu']")!
      .getBoundingClientRect();
    await expect(frame.top).toBeGreaterThanOrEqual(0);
    await expect(frame.bottom).toBeLessThanOrEqual(window.innerHeight + 1);

    // The meter is the one opaque thing in the menu, so it is the one thing
    // that can cover the frame. Its box has to stay inside the menu's own. The
    // paint itself needs a screenshot; this pins the geometry that decides it.
    await expect(pinned.left).toBeGreaterThan(frame.left);
    await expect(pinned.right).toBeLessThan(frame.right);
  },
};

/** The painted outline width, in pixels, however the stylesheet spells it. */
function outlineWidth(element: HTMLElement): number {
  const { outlineStyle, outlineWidth } = getComputedStyle(element);
  if (outlineStyle === "none") return 0;
  return Number.parseFloat(outlineWidth) || 0;
}

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
 * The level meter's icon sits on the same centre line as the radio controls of
 * the devices above it.
 *
 * Held here because it is a fact about two components side by side, and because
 * layout decides it: the meter's row is inset to keep the menu's frame clear,
 * and its icon is a different size from a radio control, so the padding that
 * lines them up is arithmetic that would otherwise go stale in silence.
 */
export const MeterAlignsWithTheDeviceRows: Story = {
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

/** Where an element sits on the inline axis, at its middle. */
function centre(element: Element): number {
  const box = element.getBoundingClientRect();
  return box.left + box.width / 2;
}

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

/**
 * The camera menu's blur toggle, which the keyboard reaches after the cameras.
 *
 * It is a checkbox item and a child of the menu rather than of the device list,
 * so a focus ring hung on the list alone left it with the browser's own —
 * which follows the pointer, and is what the ring exists to replace.
 */
export const FocusRingCoversTheBlurToggle: Story = {
  args: {
    ...VideoUnmute.args,
    iconsAndLabels: "video",
    videoBlurEnabled: false,
    videoBlurToggleClick: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const toggle = await within(document.body).findByRole("menuitemcheckbox", {
      name: /Blur background/,
    });

    // Arrowed down past the cameras to the toggle, which is the last thing in
    // the menu.
    for (let i = 0; i < 6 && document.activeElement !== toggle; i++)
      await userEvent.keyboard("{ArrowDown}");
    await expect(document.activeElement).toBe(toggle);
    // The same ring the device rows get.
    await expect(outlineWidth(toggle)).toBeGreaterThan(0);

    // And the pointer takes it away again, with the toggle still focused — so
    // there is something to light up and it is not lit.
    await userEvent.hover(toggle);
    await expect(document.activeElement).toBe(toggle);
    await expect(outlineWidth(toggle)).toBe(0);
  },
};

/**
 * Stand-in background art, drawn here rather than imported, so these stories
 * carry no asset of their own. The shipped images do not exist yet.
 */
const swatch = (from: string, to: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${from}"/>` +
      `<stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
      `<rect width="80" height="60" fill="url(#g)"/></svg>`,
  )}`;

const backgroundEffects = [
  { id: "none", label: "None", kind: "none" as const },
  { id: "blur", label: "Blur", kind: "blur" as const },
  {
    id: "indoor",
    label: "Indoor",
    kind: "image" as const,
    imageUrl: swatch("#d8c9a8", "#8a6f4a"),
  },
  {
    id: "outdoor",
    label: "Outdoor",
    kind: "image" as const,
    imageUrl: swatch("#9fd0e8", "#2f6f4f"),
  },
];

/**
 * The camera menu's Background effects section: no effect, blur, the shipped
 * images, and the tile for adding your own.
 */
export const BackgroundEffects: Story = {
  args: {
    title: "Camera",
    iconsAndLabels: "video",
    enabled: true,
    options: [
      { label: { type: "name", name: "Camera 1" }, id: "1" },
      { label: { type: "name", name: "Camera 2" }, id: "2" },
    ],
    selectedOption: "1",
    onSelect: fn(),
    backgroundEffects,
    selectedBackgroundEffect: "none",
    onSelectBackgroundEffect: fn(),
    onAddBackgroundImage: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));

    // The section is headed by its own rule, drawn edge to edge like the
    // camera section's above it, and nothing divides the two besides.
    const menu = document.body.querySelector("[role='menu']")!;
    await expect(
      document.body.querySelectorAll("[role='separator']"),
    ).toHaveLength(0);
    const headings = document.body.querySelectorAll<HTMLElement>(
      `.${styles.sectionHeading}`,
    );
    await expect(headings).toHaveLength(2);
    const frame = menu.getBoundingClientRect();
    const rules = [...headings].map((h) => h.querySelector("h3")!);
    for (const rule of rules) {
      await expect(
        Number.parseFloat(getComputedStyle(rule).borderBottomWidth),
      ).toBeGreaterThan(0);
      const box = rule.getBoundingClientRect();
      await expect(box.left - frame.left).toBeLessThanOrEqual(2);
      await expect(frame.right - box.right).toBeLessThanOrEqual(2);
    }

    // The grid is its section's first control, so it starts under its rule
    // where the camera list's first control starts under that one. Stated as
    // the two being level, because the design draws them level; measured off
    // the mock they sit within a couple of pixels of each other.
    const radio = document.body.querySelector("input[type='radio']")!;
    const tile = document.body.querySelector(`.${styles.effectTile}`)!;
    const under = (control: Element, rule: Element): number =>
      control.getBoundingClientRect().top - rule.getBoundingClientRect().bottom;
    await expect(
      Math.abs(under(radio, rules[0]) - under(tile, rules[1])),
    ).toBeLessThanOrEqual(1);

    const blur = await within(document.body).findByRole("menuitemradio", {
      name: "Blur",
    });
    await userEvent.click(blur);
    await expect(args.onSelectBackgroundEffect).toHaveBeenCalledWith("blur");
  },
};

/** An image is in force, so the grid marks it rather than no effect. */
export const BackgroundImageChosen: Story = {
  args: {
    ...BackgroundEffects.args,
    selectedBackgroundEffect: "outdoor",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));

    const chosen = await within(document.body).findByRole("menuitemradio", {
      name: "Outdoor",
    });
    // The selection is announced, not only drawn.
    await expect(chosen).toHaveAttribute("aria-checked", "true");
  },
};

/**
 * Where the browser or device cannot run background processing. The section
 * keeps its shape and its tiles, and none of them can be chosen.
 */
export const BackgroundEffectsUnavailable: Story = {
  args: {
    ...BackgroundEffects.args,
    onSelectBackgroundEffect: undefined,
    onAddBackgroundImage: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));

    const blur = await within(document.body).findByRole("menuitemradio", {
      name: "Blur",
    });
    await waitFor(async () =>
      expect(blur).toHaveAttribute("aria-disabled", "true"),
    );

    // No effect needs no background processing, so it stays choosable.
    const none = await within(document.body).findByRole("menuitemradio", {
      name: "None",
    });
    await expect(none).not.toHaveAttribute("aria-disabled", "true");
  },
};

/**
 * A device name long enough to set the menu's width, so the tiles are seen at
 * the widest the menu gets rather than only at the narrowest.
 */
export const BackgroundEffectsWithALongDeviceName: Story = {
  args: {
    ...BackgroundEffects.args,
    options: [
      {
        label: {
          type: "name",
          name: "Logitech BRIO 4K Ultra HD Pro Business Webcam (046d:085e)",
        },
        id: "1",
      },
      { label: { type: "name", name: "Camera 2" }, id: "2" },
    ],
    selectedOption: "1",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));

    const none = await within(document.body).findByRole("menuitemradio", {
      name: "None",
    });
    // Three tiles to a row however wide the name makes the menu.
    const grid = none.parentElement!;
    await expect(
      getComputedStyle(grid).gridTemplateColumns.split(" "),
    ).toHaveLength(3);
  },
};

/**
 * Backgrounds the user added are theirs to remove — except the one in force,
 * which is what they are wearing.
 */
export const AddedBackgroundsCanBeRemoved: Story = {
  args: {
    ...BackgroundEffects.args,
    backgroundEffects: [
      ...backgroundEffects,
      {
        id: "added:one",
        label: "Background 3",
        kind: "image" as const,
        imageUrl: swatch("#c2410c", "#7c2d12"),
        removable: true,
      },
      {
        id: "added:two",
        label: "Background 4",
        kind: "image" as const,
        imageUrl: swatch("#1d4ed8", "#172554"),
        removable: true,
      },
    ],
    selectedBackgroundEffect: "added:one",
    onRemoveBackgroundEffect: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const body = within(document.body);

    // The one in force offers no removal.
    const inForce = await body.findByRole("menuitemradio", {
      name: "Background 3",
    });
    await expect(inForce).not.toHaveAttribute("aria-keyshortcuts");

    // The other does, and says so, and Delete reaches it from the keyboard.
    const other = await body.findByRole("menuitemradio", {
      name: "Background 4",
    });
    await expect(other).toHaveAttribute("aria-keyshortcuts", "Delete");
    other.focus();
    await userEvent.keyboard("{Delete}");
    await expect(args.onRemoveBackgroundEffect).toHaveBeenCalledWith(
      "added:two",
    );
  },
};

/**
 * Removal where choosing a tile really changes what is in force, as it does in
 * a call.
 *
 * The static stories cannot catch this: pressing the cross also reaches the
 * tile, and with live selection that made the tile the one in force, which
 * took the cross away before its own click landed. By mouse nothing happened;
 * by keyboard it worked, because the keyboard never touches the cross.
 */
export const RemovingWithLiveSelection: Story = {
  args: { ...AddedBackgroundsCanBeRemoved.args },
  render: function WithLiveSelection(args): JSX.Element {
    const [selected, setSelected] = useState("none");
    const [effects, setEffects] = useState(args.backgroundEffects ?? []);
    return (
      <MediaMuteAndSwitchButton
        {...args}
        backgroundEffects={effects}
        selectedBackgroundEffect={selected}
        onSelectBackgroundEffect={setSelected}
        onRemoveBackgroundEffect={(id): void =>
          setEffects((current) => current.filter((o) => o.id !== id))
        }
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const body = within(document.body);

    const tile = await body.findByRole("menuitemradio", {
      name: "Background 4",
    });
    await userEvent.hover(tile);
    // Beside the tile, not inside it: a control within a menu item would be
    // invalid, and the item would take the click first.
    const cross = tile.parentElement!.querySelector<HTMLElement>(
      `.${styles.effectRemove}`,
    )!;
    await expect(cross).toBeVisible();
    await userEvent.click(cross);

    // Gone, and it did not make itself the one in force on the way out.
    await waitFor(async () =>
      expect(
        body.queryByRole("menuitemradio", { name: "Background 4" }),
      ).toBeNull(),
    );
    const none = await body.findByRole("menuitemradio", { name: "None" });
    await expect(none).toHaveAttribute("aria-checked", "true");
  },
};

/** A file that could not be used, said where the user chose it. */
export const BackgroundImageRefused: Story = {
  args: {
    ...BackgroundEffects.args,
    backgroundEffectError: "Animated images cannot be used as a background",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const body = within(document.body);

    // Scoped to the open menu: a closed one leaves its own markup behind, and
    // the first match in the document belongs to that rather than to this.
    const menu = await body.findByRole("menu");
    await waitFor(async () =>
      expect(
        menu.querySelector<HTMLElement>(`.${styles.effectError}`),
      ).toHaveTextContent("Animated images cannot be used as a background"),
    );
    // The grid is still there to choose from: being refused a file changes
    // nothing about the background in force.
    await expect(
      await body.findByRole("menuitemradio", { name: "None" }),
    ).toHaveAttribute("aria-checked", "true");
  },
};
