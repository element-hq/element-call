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
import { METER_SEGMENTS } from "../state/MicrophoneLevel";

/**
 * A width to show the meter at, close to the menu it lives in.
 *
 * Not a copy of the menu's width, and nothing depends on the two agreeing: a
 * bar and the gap beside it are a fixed size now, so this only decides how many
 * bars there is room for. Without a width at all the stories would shrink-wrap
 * to almost nothing and show a meter two bars wide, which is no use to anyone
 * looking at them.
 */
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

/**
 * A quiet room. Nothing is lit: room hiss below the noise floor must not read
 * as "it can hear me".
 */
export const Silent: Story = {
  args: { state: { type: "level", level: 0 } },
  play: async ({ canvasElement }) => {
    await expect(litSegments(canvasElement)).toBe(0);
  },
};

export const QuietSpeech: Story = {
  args: { state: { type: "level", level: 5 } },
};

export const NormalSpeech: Story = {
  args: { state: { type: "level", level: 12 } },
  play: async ({ canvasElement }) => {
    // Shown at something like the width of the menu, so the meter in a story
    // reads like the meter in a call rather than like a handful of bars. The
    // design's own mock has sixteen of them at this width; a floor rather than
    // a count, because the number follows from the bar and gap sizes and those
    // are the design's to change.
    await expect(
      canvasElement.getElementsByClassName(styles.segment).length,
    ).toBeGreaterThanOrEqual(15);
  },
};

export const LoudSpeech: Story = {
  args: { state: { type: "level", level: METER_SEGMENTS } },
};

/**
 * The three volumes differ by how many bars are lit, so the level survives
 * greyscale and a screen reader as well as it survives colour.
 */
export const VolumesAreDistinguishable: Story = {
  args: { state: { type: "level", level: 5 } },
  play: async ({ canvasElement, mount }) => {
    const lit: number[] = [];
    for (const level of [5, 12, METER_SEGMENTS]) {
      await mount(<MicrophoneLevelMeter state={{ type: "level", level }} />);
      lit.push(litSegments(canvasElement));
      await expect(within(canvasElement).getByRole("meter")).toHaveAttribute(
        "aria-valuenow",
        String(level),
      );
    }
    // Three different counts, rising: the level is carried by how many bars
    // are lit, not by their colour alone.
    await expect(new Set(lit).size).toBe(lit.length);
    await expect(lit).toEqual([...lit].sort((a, b) => a - b));
  },
};

/**
 * Permission refused. A message with a next action, never a still meter that
 * reads as silence.
 */
export const PermissionDenied: Story = {
  args: { state: { type: "permission-denied" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("meter")).toBeNull();
    await expect(
      canvas.getByText(/Allow access in your browser settings/),
    ).toBeVisible();
  },
};

/** No input device at all, told apart from a refusal. */
export const NoDevice: Story = {
  args: { state: { type: "no-device" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("meter")).toBeNull();
    await expect(canvas.getByText(/No microphone found/)).toBeVisible();
  },
};

/**
 * The same meter at two widths.
 *
 * A bar and the space beside it are always the same size; what changes is how
 * many bars there are. Spreading a fixed number of bars instead would make the
 * meter a different shape in every place it is used, and close the bars up into
 * one block wherever the space ran short — and bars that touch cannot be
 * counted, which is what carries the level without colour.
 */
export const ShapeStaysTheSameAtAnyWidth: Story = {
  args: { state: { type: "level", level: 12 } },
  play: async ({ mount, args }) => {
    const narrow = await measureAt(mount, args, 180);
    const wide = await measureAt(mount, args, 400);

    await expect(narrow.bar).toBe(wide.bar);
    await expect(narrow.gap).toBe(wide.gap);
    await expect(narrow.count).toBeLessThan(wide.count);
    // And the bars are still bars, not one run of colour.
    await expect(narrow.gap).toBeGreaterThan(0);
  },
};

/** How many bars are painted as carrying level, rather than as empty. */
function litSegments(canvasElement: HTMLElement): number {
  return canvasElement.getElementsByClassName(styles.segmentLit).length;
}

/** Renders the meter at one width and reports the shape of its bars. */
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
