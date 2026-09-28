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
import { type BackgroundEffectOption } from "./BackgroundEffectGrid";
import { shippedBackgrounds } from "../livekit/backgroundEffects";
import meterStyles from "./MicrophoneLevelMeter.module.css";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { RootElementProvider } from "../RootElementContext";
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

/** Supplies a call-sized root. Without one the list is bounded by the whole Storybook frame. */
const WithACallArea: FC<{ children: ReactNode; blockSize?: number }> = ({
  children,
  // A call's size: anything smaller makes a short device list scroll, and a
  // narrower one narrows the menu.
  blockSize = 720,
}) => {
  const [callArea, setCallArea] = useState<HTMLElement | null>(null);
  return (
    <div
      ref={setCallArea}
      style={{
        blockSize,
        inlineSize: 1024,
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
    iconsAndLabels: "audio",
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
    iconsAndLabels: "audio",
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
    iconsAndLabels: "video",
    enabled: false,
    options: [
      { label: { type: "name", name: "Camera 1" }, id: "1" },
      { label: { type: "name", name: "Camera 2" }, id: "2" },
    ],

    selectedOption: "1",
  },
};

const effects: BackgroundEffectOption[] = [
  { id: "none", kind: "none", label: "None" },
  { id: "blur", kind: "blur", label: "Blur" },
  ...shippedBackgrounds.map((background, i) => ({
    id: `image:${background.id}`,
    kind: "image" as const,
    label: `Background ${i + 1}`,
    imageUrl: background.imagePath,
  })),
];

export const VideoUnmute: Story = {
  args: {
    iconsAndLabels: "video",
    enabled: true,
    options: [
      { label: { type: "name", name: "Camera 1" }, id: "1" },
      { label: { type: "name", name: "Camera 2" }, id: "2" },
    ],
    selectedOption: "2",
    backgroundEffects: effects,
    selectedBackgroundEffect: "none",
    onSelectBackgroundEffect: fn(),
    onAddBackgroundImage: fn(),
  },
};

/** One choice among no effect, blur and the shipped images, under the cameras. */
export const BackgroundEffects: Story = {
  args: VideoUnmute.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const menu = within(document.body);
    const section = await menu.findByRole("group", {
      name: "Background effects",
    });
    const tiles = within(section).getAllByRole("menuitemradio");
    await expect(tiles.map((tile) => tile.textContent)).toEqual([
      "None",
      "Blur",
      "Background 1",
      "Background 2",
    ]);
    await expect(
      within(section).getByRole("menuitemradio", { checked: true }),
    ).toHaveTextContent("None");

    const cameras = menu.getByRole("group", { name: "Camera" });
    await expect(
      cameras.compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const [first, second, third, fourth] = tiles.map((tile) =>
      tile.getBoundingClientRect(),
    );
    await expect(second.top).toBe(first.top);
    await expect(third.top).toBe(first.top);
    await expect(fourth.top).toBeGreaterThan(first.bottom);
    const frame = document.body
      .querySelector("[role='menu']")!
      .getBoundingClientRect();
    for (const tile of [first, second, third])
      await expect(tile.left >= frame.left && tile.right <= frame.right).toBe(
        true,
      );

    const add = within(section).getByRole("menuitem", { name: "Add image" });
    await expect(
      tiles[3].compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(menu.getByRole("menuitemradio", { name: "Blur" }));
    await expect(args.onSelectBackgroundEffect).toHaveBeenCalledWith("blur");
    await expect(menu.getByRole("menu")).toBeVisible();
  },
};

/** Where effects can't run: shown, disabled and explained, except no effect. */
export const BackgroundEffectsUnavailable: Story = {
  args: {
    ...VideoUnmute.args,
    onSelectBackgroundEffect: undefined,
    backgroundEffectNotice:
      "Background effects are not supported on this platform.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const menu = within(document.body);
    const section = await menu.findByRole("group", {
      name: "Background effects",
    });
    await expect(section).toHaveAccessibleDescription(
      "Background effects are not supported on this platform.",
    );
    for (const tile of within(section).getAllByRole("menuitemradio"))
      if (tile.textContent === "None")
        await expect(tile).not.toHaveAttribute("aria-disabled");
      else await expect(tile).toHaveAttribute("aria-disabled", "true");
  },
};

/** Where only the slower route exists: offered and choosable, with the cost said. */
export const BackgroundEffectsSlowInThisBrowser: Story = {
  args: {
    ...VideoUnmute.args,
    backgroundEffectNotice:
      "Background effects run slowly on this platform, which may cause your video to stutter.",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const menu = within(document.body);
    const section = await menu.findByRole("group", {
      name: "Background effects",
    });
    await expect(section).toHaveAccessibleDescription(
      "Background effects run slowly on this platform, which may cause your video to stutter.",
    );
    for (const tile of within(section).getAllByRole("menuitemradio"))
      await expect(tile).not.toHaveAttribute("aria-disabled");
    await userEvent.click(
      within(section).getByRole("menuitemradio", { name: "Background 1" }),
    );
    await expect(args.onSelectBackgroundEffect).toHaveBeenCalledWith(
      "image:arc",
    );

    const notice = document.body.querySelector(`.${styles.notice}`)!;
    const frame = document.body
      .querySelector("[role='menu']")!
      .getBoundingClientRect();
    await expect(frame.width).toBeLessThanOrEqual(296);
    await expect(notice.getBoundingClientRect().right).toBeLessThanOrEqual(
      frame.right,
    );
  },
};

/** The first effect of a session shows its wait on its own tile. */
export const BackgroundEffectsSettling: Story = {
  args: {
    ...VideoUnmute.args,
    selectedBackgroundEffect: "blur",
    backgroundEffectSettling: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const menu = within(document.body);
    const chosen = await menu.findByRole("menuitemradio", {
      name: "Blur",
      checked: true,
    });
    await expect(chosen).toHaveAttribute("aria-busy", "true");
    const marks = chosen.querySelectorAll("svg");
    await expect(marks).toHaveLength(1);
    await expect(getComputedStyle(marks[0]).animationName).not.toBe("none");
    const section = menu.getByRole("group", { name: "Background effects" });
    for (const other of within(section).getAllByRole("menuitemradio", {
      checked: false,
    }))
      await expect(other).toHaveAttribute("aria-busy", "false");
  },
};

/** A file that can't be used: said where it was chosen, and nothing changes. */
export const BackgroundImageRefused: Story = {
  args: {
    ...VideoUnmute.args,
    selectedBackgroundEffect: "blur",
    backgroundEffectNotice:
      "Background effects run slowly on this platform, which may cause your video to stutter.",
    backgroundImageRefusal: { text: "That file is not a supported image" },
  },
  decorators: [
    (Story): JSX.Element => (
      <WithACallArea blockSize={300}>
        <Story />
      </WithACallArea>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const menu = within(document.body);
    const message = await menu.findByText("That file is not a supported image");
    const list = document.body.querySelector<HTMLElement>(
      `.${styles.deviceList}`,
    )!;
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    const scrollport = list.getBoundingClientRect();
    const shown = message.getBoundingClientRect();
    await expect(shown.bottom).toBeLessThanOrEqual(scrollport.bottom + 1);
    await expect(shown.top).toBeGreaterThanOrEqual(scrollport.top - 1);
    await expect(menu.queryByText(/run slowly/)).toBeNull();
    await expect(
      menu.getByRole("menuitemradio", { name: "Blur" }),
    ).toHaveAttribute("aria-checked", "true");
  },
};

/** A flat picture, for backgrounds of one's own. */
function swatch(colour: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="${colour}"/></svg>`,
  )}`;
}

/** One's own backgrounds are removable, never the one in force. */
export const AddedBackgroundsCanBeRemoved: Story = {
  args: {
    ...VideoUnmute.args,
    backgroundEffects: [
      ...effects,
      {
        id: "added:one",
        label: "Background 3",
        kind: "image",
        imageUrl: swatch("#c2410c"),
        removable: true,
      },
      {
        id: "added:two",
        label: "Background 4",
        kind: "image",
        imageUrl: swatch("#1d4ed8"),
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

    const inForce = await body.findByRole("menuitemradio", {
      name: "Background 3",
    });
    await expect(inForce).not.toHaveAttribute("aria-keyshortcuts");

    const other = body.getByRole("menuitemradio", { name: "Background 4" });
    await expect(other).toHaveAttribute("aria-keyshortcuts", "Delete");
    other.focus();
    await userEvent.keyboard("{Delete}");
    await expect(args.onRemoveBackgroundEffect).toHaveBeenCalledWith(
      "added:two",
    );

    const wrapper = other.parentElement!;
    await userEvent.hover(wrapper);
    const cross = wrapper.querySelector<HTMLElement>(
      "[aria-hidden]:last-child",
    )!;
    const probe = document.createElement("span");
    probe.style.color = "var(--cpd-color-icon-critical-primary)";
    cross.append(probe);
    const critical = getComputedStyle(probe).color;
    probe.remove();
    await expect(getComputedStyle(cross).color).toBe(critical);
    const tile = other.getBoundingClientRect();
    const box = cross.getBoundingClientRect();
    await expect(box.right).toBeGreaterThan(tile.right);
    await expect(box.top).toBeLessThan(tile.top);

    await userEvent.hover(cross);
    await waitFor(async () =>
      expect(
        [...document.body.querySelectorAll("div")].some(
          (d) => d.textContent === "Remove" && d.offsetParent !== null,
        ),
      ).toBe(true),
    );
  },
};

/** Removing by pointer while the selection really changes. */
export const RemovingWithLiveSelection: Story = {
  args: AddedBackgroundsCanBeRemoved.args,
  render: function WithLiveSelection(args): JSX.Element {
    const [selected, setSelected] = useState("none");
    const [offered, setOffered] = useState(args.backgroundEffects ?? []);
    return (
      <MediaMuteAndSwitchButton
        {...args}
        backgroundEffects={offered}
        selectedBackgroundEffect={selected}
        onSelectBackgroundEffect={setSelected}
        onRemoveBackgroundEffect={(id): void =>
          setOffered((current) => current.filter((o) => o.id !== id))
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
    const cross = tile.parentElement!.querySelector<HTMLElement>(
      "[aria-hidden]:last-child",
    )!;
    await expect(cross).toBeVisible();
    await userEvent.click(cross);

    await waitFor(async () =>
      expect(
        body.queryByRole("menuitemradio", { name: "Background 4" }),
      ).toBeNull(),
    );
    await expect(
      body.getByRole("menuitemradio", { name: "None" }),
    ).toHaveAttribute("aria-checked", "true");
  },
};

/** In a short call the effects scroll into view with the list. */
export const BackgroundEffectsScrollWhenTheyDoNotFit: Story = {
  args: {
    ...VideoUnmute.args,
    // It sits with the effects, so it must fit the same share of the call.
    backgroundEffectNotice:
      "Background effects run slowly on this platform, which may cause your video to stutter.",
  },
  decorators: [
    (Story): JSX.Element => (
      <WithACallArea blockSize={300}>
        <Story />
      </WithACallArea>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const menu = within(document.body);
    const last = await menu.findByRole("menuitemradio", {
      name: "Background 2",
    });
    const list = document.body.querySelector<HTMLElement>(
      `.${styles.deviceList}`,
    )!;
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    await expect(last.getBoundingClientRect().top).toBeGreaterThan(
      list.getBoundingClientRect().bottom,
    );

    // Scrolled under the section's heading, the tiles pass beneath it.
    const heading = [
      ...document.body.querySelectorAll<HTMLElement>(
        `.${styles.sectionHeading}`,
      ),
    ].find((h) => h.textContent === "Background effects")!;
    list.scrollTop = heading.offsetTop + 30;
    await waitFor(async () => {
      const box = heading.getBoundingClientRect();
      const drawn = document.elementFromPoint(
        box.left + box.width / 2,
        box.bottom - 2,
      );
      await expect(heading.contains(drawn)).toBe(true);
    });
    list.scrollTop = 0;

    for (let i = 0; i < 10 && document.activeElement !== last; i++)
      await userEvent.keyboard("{ArrowDown}");
    await expect(document.activeElement).toBe(last);
    const scrollport = list.getBoundingClientRect();
    const reached = last.getBoundingClientRect();
    await expect(reached.bottom).toBeLessThanOrEqual(scrollport.bottom + 1);
    await expect(reached.top).toBeGreaterThanOrEqual(scrollport.top - 1);

    const callArea = canvasElement
      .querySelector<HTMLElement>("[style*='block-size: 300px']")!
      .getBoundingClientRect();
    const frame = document.body
      .querySelector("[role='menu']")!
      .getBoundingClientRect();
    await expect(frame.top).toBeGreaterThanOrEqual(callArea.top);
    await expect(frame.bottom).toBeLessThanOrEqual(callArea.bottom);
  },
};

export const SpeakerAndMicrophoneSections: Story = {
  args: {
    ...Default.args,
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

    // A few devices fit, so the list doesn't scroll.
    const list = document.body.querySelector<HTMLElement>(
      `.${styles.deviceList}`,
    )!;
    await expect(list.scrollHeight).toBe(list.clientHeight);

    // Each section is headed by its own edge-to-edge rule, with no separator.
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

/** The list scrolls; the meter stays at the foot of the microphone section. */
export const ManyDevices: Story = {
  args: {
    ...Default.args,
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

    // The sticky wrapper rather than the meter: without a fake microphone (as on
    // WebKit) the meter shows a message instead of a level.
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

    // The meter is the menu's one opaque part, so it must stay inside the frame.
    await expect(pinned.left).toBeGreaterThan(frame.left);
    await expect(pinned.right).toBeLessThan(frame.right);

    // A list long enough to scroll keeps clear of the frame, which it can
    // otherwise paint over.
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    const box = list.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(frame.left + 1);
    await expect(box.right).toBeLessThanOrEqual(frame.right - 1);
  },
};

/** Painted outline width, in px. */
function outlineWidth(element: HTMLElement): number {
  const { outlineStyle, outlineWidth } = getComputedStyle(element);
  if (outlineStyle === "none") return 0;
  return Number.parseFloat(outlineWidth) || 0;
}

/** Safari lists no outputs: a disabled, selected Default stands in. */
export const OutputNotEnumerated: Story = {
  args: {
    ...Default.args,
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

/** The meter's icon shares the radio controls' centre line; only a real browser lays this out. */
export const MeterAlignsWithTheDeviceRows: Story = {
  args: {
    ...Default.args,
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

/** Inline-axis centre of an element. */
function centre(element: Element): number {
  const box = element.getBoundingClientRect();
  return box.left + box.width / 2;
}

/** Every row the keyboard reaches is fully visible, not under a heading or the meter. */
export const KeyboardReachesEveryDevice: Story = {
  args: {
    ...Default.args,
    iconsAndLabels: "audio",
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
        `.${styles.stickyMeter}`,
      );
      if (element === null) throw new Error("the meter has not rendered yet");
      return element;
    });

    // Drawn over the list: the sticky headings and the meter.
    const overlays = [
      meter,
      ...document.body.querySelectorAll<HTMLElement>(
        `.${styles.sectionHeading}`,
      ),
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
    // By class: the heading is aria-hidden, and its group carries the name.
    const heading = group.querySelector<HTMLElement>(
      `.${styles.sectionHeading}`,
    )!;

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
    // Clear of the menu's frame.
    const frame = document.body
      .querySelector("[role='menu']")!
      .getBoundingClientRect();
    await expect(heading.getBoundingClientRect().left).toBeGreaterThan(
      frame.left,
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

/** The effect tiles get the keyboard ring the device rows get. */
export const FocusRingCoversTheEffectTiles: Story = {
  args: VideoUnmute.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const tile = await within(document.body).findByRole("menuitemradio", {
      name: "Blur",
    });

    for (let i = 0; i < 6 && document.activeElement !== tile; i++)
      await userEvent.keyboard("{ArrowDown}");
    await expect(document.activeElement).toBe(tile);
    await expect(outlineWidth(tile)).toBeGreaterThan(0);

    await userEvent.hover(tile);
    await expect(document.activeElement).toBe(tile);
    await expect(outlineWidth(tile)).toBe(0);
  },
};
