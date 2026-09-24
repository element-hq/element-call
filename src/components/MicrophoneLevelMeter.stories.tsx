/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, within } from "storybook/test";
import { type JSX } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  MicrophoneLevelMeter,
  type MicrophoneLevelMeterProps,
} from "./MicrophoneLevelMeter";
import styles from "./MicrophoneLevelMeter.module.css";
import { LEVEL_SCALE } from "../state/MicrophoneLevel";
import { constant } from "../state/Behavior";

/** Roughly the menu's width. It only decides how many bars fit. */
const STORY_WIDTH = 256;

const meta = {
  component: MicrophoneLevelMeter,
  decorators: [
    (Story): JSX.Element => (
      <div style={{ inlineSize: STORY_WIDTH }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    state: {
      description:
        "What the selected microphone can say about itself: a level, or a reason there is none.",
    },
  },
} satisfies Meta<typeof MicrophoneLevelMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A quiet room: hiss below the noise floor lights nothing. */
export const Silent: Story = {
  args: { state: { type: "level", level$: constant(0) } },
  play: async ({ canvasElement }) => {
    await expect(litSegments(canvasElement)).toBe(0);
  },
};

export const QuietSpeech: Story = {
  args: { state: { type: "level", level$: constant(5) } },
};

export const NormalSpeech: Story = {
  args: { state: { type: "level", level$: constant(12) } },
  play: async ({ canvasElement }) => {
    // A floor, not a count: the count follows from the design's bar and gap sizes.
    await expect(
      canvasElement.getElementsByClassName(styles.segment).length,
    ).toBeGreaterThanOrEqual(15);
  },
};

export const LoudSpeech: Story = {
  args: { state: { type: "level", level$: constant(LEVEL_SCALE) } },
};

/** The three volumes differ in how many bars are lit, not only in colour. */
export const VolumesAreDistinguishable: Story = {
  args: { state: { type: "level", level$: constant(5) } },
  play: async ({ canvasElement, mount }) => {
    const lit: number[] = [];
    for (const level of [5, 12, LEVEL_SCALE]) {
      await mount(
        <MicrophoneLevelMeter
          state={{ type: "level", level$: constant(level) }}
        />,
      );
      lit.push(litSegments(canvasElement));
      await expect(within(canvasElement).getByRole("meter")).toHaveAttribute(
        "aria-valuenow",
        String(level),
      );
    }
    await expect(new Set(lit).size).toBe(lit.length);
    await expect(lit).toEqual([...lit].sort((a, b) => a - b));
  },
};

/** Permission refused: a message with a next action, not a still meter. */
export const PermissionDenied: Story = {
  args: { state: { type: "permission-denied" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("meter")).toBeNull();
    await expect(
      canvas.getByText(/Microphone access is blocked/),
    ).toBeVisible();
  },
};

/** No input device, told apart from a refusal. */
export const NoDevice: Story = {
  args: { state: { type: "no-device" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("meter")).toBeNull();
    await expect(canvas.getByText(/No microphone found/)).toBeVisible();

    // The icon sits on the middle of the text, however many lines it runs to.
    const middle = (element: Element): number => {
      const box = element.getBoundingClientRect();
      return box.top + box.height / 2;
    };
    const icon = canvasElement.getElementsByClassName(styles.icon)[0];
    const words = canvasElement.getElementsByClassName(styles.message)[0];
    await expect(Math.abs(middle(icon) - middle(words))).toBeLessThanOrEqual(1);
  },
};

/** The same meter at two widths: the bars keep their size and only their count changes. */
export const ShapeStaysTheSameAtAnyWidth: Story = {
  args: { state: { type: "level", level$: constant(12) } },
  play: async ({ mount, args }) => {
    const narrow = await measureAt(mount, args, 180);
    const wide = await measureAt(mount, args, 400);

    await expect(narrow.bar).toBe(wide.bar);
    await expect(narrow.gap).toBe(wide.gap);
    await expect(narrow.count).toBeLessThan(wide.count);
    // The bars are still separate, not one run of colour.
    await expect(narrow.gap).toBeGreaterThan(0);
  },
};

/** How many bars are lit. */
function litSegments(canvasElement: HTMLElement): number {
  return canvasElement.getElementsByClassName(styles.segmentLit).length;
}

/** Renders the meter at one width and reports its bars' shape. */
async function measureAt(
  mount: (ui: JSX.Element) => Promise<unknown>,
  args: MicrophoneLevelMeterProps,
  width: number,
): Promise<{ count: number; bar: number; gap: number }> {
  await mount(
    <div style={{ inlineSize: width }}>
      <MicrophoneLevelMeter {...args} />
    </div>,
  );
  const bars = Array.from(document.body.getElementsByClassName(styles.segment));
  const first = bars[0].getBoundingClientRect();
  const second = bars[1].getBoundingClientRect();
  return {
    count: bars.length,
    bar: first.width,
    gap: second.left - first.right,
  };
}
