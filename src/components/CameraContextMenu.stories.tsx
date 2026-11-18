/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn, userEvent, waitFor, within, expect } from "storybook/test";
import { useEffect, useState, type FC, type JSX } from "react";
import { useTranslation } from "react-i18next";

import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CameraContextMenu,
  type CameraContextMenuProps,
} from "./CameraContextMenu";
import { MediaButtonWithContextMenu } from "./MediaButtonWithContextMenu";
import { VideoButton } from "../button";
import styles from "./CameraContextMenu.module.css";
import deviceMenuStyles from "./DeviceMenu.module.css";
import { type BackgroundEffectGridItem } from "./BackgroundEffectGrid";
import { SelfPreview } from "./SelfPreview";
import { shippedBackgrounds } from "../tracks/backgroundEffectCatalog";
import { outlineWidth, WithACallArea } from "./DeviceMenuStoryFixtures";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";

const mediaDevices = new MediaDevices(globalScope, {
  controlledAudioDevices: false,
});

/** A camera for the preview: a figure against a room, drawn to a stream. */
const FakeCamera: FC = () => {
  const [stream, setStream] = useState<MediaStream>();
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    const draw = (): void => {
      context.fillStyle = "#6b7f8e";
      context.fillRect(0, 0, 640, 360);
      context.fillStyle = "#c9a27e";
      context.beginPath();
      context.arc(320, 150, 62, 0, 2 * Math.PI);
      context.fill();
      context.fillStyle = "#34495e";
      context.beginPath();
      context.ellipse(320, 380, 150, 140, 0, Math.PI, 2 * Math.PI);
      context.fill();
    };
    draw();
    // Redrawn, so the stream keeps delivering frames.
    const timer = setInterval(draw, 200);
    const captured = canvas.captureStream(10);
    setStream(captured);
    return (): void => {
      clearInterval(timer);
      captured.getTracks().forEach((track) => track.stop());
    };
  }, []);
  return (
    <video
      data-testid="preview-camera"
      autoPlay
      muted
      playsInline
      ref={(video): void => {
        if (video && stream && video.srcObject !== stream)
          video.srcObject = stream;
      }}
    />
  );
};

/** The menu as the camera's button opens it, beside its mute button. */
function CameraMenu({
  enabled = true,
  onMuteClick,
  ...menu
}: CameraContextMenuProps & {
  enabled?: boolean;
  onMuteClick?: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <MediaButtonWithContextMenu
      muteButton={
        <VideoButton
          enabled={enabled}
          onClick={onMuteClick}
          data-testid="incall_videomute"
        />
      }
      label={t("settings.devices.camera")}
      title={t("settings.devices.camera_source")}
    >
      <CameraContextMenu {...menu} />
    </MediaButtonWithContextMenu>
  );
}

const meta = {
  component: CameraMenu,
  decorators: [
    (Story): JSX.Element => (
      <MediaDevicesContext value={mediaDevices}>
        <WithACallArea>
          <Story />
        </WithACallArea>
      </MediaDevicesContext>
    ),
  ],
} satisfies Meta<typeof CameraMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VideoMute: Story = {
  args: {
    enabled: false,
    options: [
      { label: { type: "name", name: "Camera 1" }, id: "1" },
      { label: { type: "name", name: "Camera 2" }, id: "2" },
    ],
    selectedOption: "1",
    selfPreview: <SelfPreview track={null} />,
  },
};

const effects: BackgroundEffectGridItem[] = [
  { id: "none", kind: "none" },
  { id: "blur", kind: "blur" },
  ...shippedBackgrounds.map((background) => ({
    id: `image:${background.id}`,
    kind: "image" as const,
    imageUrl: background.imagePath,
  })),
];

export const VideoUnmute: Story = {
  args: {
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
    // As the footer always gives the camera menu one.
    selfPreview: <FakeCamera />,
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
    // On the tiles' own group: the section's can't carry a description.
    await expect(
      within(section).getByRole("group"),
    ).toHaveAccessibleDescription(
      "Background effects are not supported on this platform.",
    );
    for (const tile of within(section).getAllByRole("menuitemradio"))
      if (tile.textContent === "None") await expect(tile).toBeEnabled();
      else await expect(tile).toBeDisabled();
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
    // On the tiles' own group: the section's can't carry a description.
    await expect(
      within(section).getByRole("group"),
    ).toHaveAccessibleDescription(
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
    await expect(menu.queryByTestId("preview-camera")).toBeNull();
    const frames = document.body.querySelectorAll(`.${styles.selfPreview} svg`);
    await expect(frames).toHaveLength(1);
  },
};

/** A file that can't be used: said where it was chosen, and nothing changes. */
export const BackgroundImageRefused: Story = {
  args: {
    ...VideoUnmute.args,
    selectedBackgroundEffect: "blur",
    backgroundEffectNotice:
      "Background effects run slowly on this platform, which may cause your video to stutter.",
    backgroundImageRefusal: "That file is not a supported image",
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
      `.${deviceMenuStyles.deviceList}`,
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

/** One's own backgrounds are removable, unless one is the selected one. */
export const AddedBackgroundsCanBeRemoved: Story = {
  args: {
    ...VideoUnmute.args,
    backgroundEffects: [
      ...effects,
      {
        id: "added:one",
        kind: "image",
        imageUrl: swatch("#c2410c"),
        removable: true,
      },
      {
        id: "added:two",
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
      <CameraMenu
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

/** Where the call leaves room, the camera holds the top while the options scroll. */
export const BackgroundEffectsWithPreview: Story = {
  args: {
    ...VideoUnmute.args,
    // Enough that the list fills its share, so the preview's cost counts.
    options: Array.from({ length: 8 }, (_, i) => ({
      label: { type: "name" as const, name: `Camera ${i + 1}` },
      id: `${i + 1}`,
    })),
  },
  decorators: [
    (Story): JSX.Element => (
      <WithACallArea blockSize={640}>
        <Story />
      </WithACallArea>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const picture = await within(document.body).findByTestId("preview-camera");
    const preview = picture.parentElement!;
    const list = document.body.querySelector<HTMLElement>(
      `.${deviceMenuStyles.deviceList}`,
    )!;
    const frame = document.body
      .querySelector("[role='menu']")!
      .getBoundingClientRect();

    const box = preview.getBoundingClientRect();
    await expect(list.contains(preview)).toBe(false);
    await expect(box.top - frame.top).toBeLessThanOrEqual(2);
    await expect(frame.width - box.width).toBeLessThanOrEqual(2);
    await expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
    await expect(box.bottom).toBeLessThanOrEqual(
      list.getBoundingClientRect().top,
    );

    const listShare = Math.round(640 * 0.6);
    // The list runs on through the menu's padding at its foot, which isn't
    // part of its share.
    const listEnd =
      list.getBoundingClientRect().bottom -
      Number.parseFloat(getComputedStyle(list).paddingBlockEnd);
    await expect(listEnd - box.top).toBeLessThanOrEqual(listShare + 1);

    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    list.scrollTop = list.scrollHeight;
    await expect(preview.getBoundingClientRect().top).toBe(box.top);
  },
};

/** With the camera off the preview says so, and effects can still be chosen. */
export const BackgroundEffectsPreviewWithTheCameraOff: Story = {
  args: {
    ...VideoUnmute.args,
    enabled: false,
    selfPreview: <SelfPreview track={null} />,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Camera" }));
    const menu = within(document.body);
    await menu.findByRole("group", { name: "Background effects" });
    const preview = document.body.querySelector(`.${styles.selfPreview}`)!;
    await expect(preview.querySelector("video")).toBeNull();
    await expect(preview.querySelector("svg")).not.toBeNull();

    await userEvent.click(menu.getByRole("menuitemradio", { name: "Blur" }));
    await expect(args.onSelectBackgroundEffect).toHaveBeenCalledWith("blur");
  },
};

/** In a call too short to hold it, the camera leads the options and scrolls away. */
export const BackgroundEffectsPreviewScrollsWithTheList: Story = {
  args: VideoUnmute.args,
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
    const picture = await within(document.body).findByTestId("preview-camera");
    const preview = picture.parentElement!;
    const list = document.body.querySelector<HTMLElement>(
      `.${deviceMenuStyles.deviceList}`,
    )!;
    await expect(list.contains(preview)).toBe(true);
    const cameras = within(document.body).getByRole("group", {
      name: "Camera",
    });
    await expect(
      preview.compareDocumentPosition(cameras) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    list.scrollTop = list.scrollHeight;
    await expect(preview.getBoundingClientRect().bottom).toBeLessThan(
      list.getBoundingClientRect().top,
    );
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
      `.${deviceMenuStyles.deviceList}`,
    )!;
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    await expect(last.getBoundingClientRect().top).toBeGreaterThan(
      list.getBoundingClientRect().bottom,
    );

    // Scrolled under the section's heading, the tiles pass beneath it. By
    // position: Compound's heading is the section's hidden first child.
    const heading = menu.getByRole("group", { name: "Background effects" })
      .firstElementChild as HTMLElement;
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
