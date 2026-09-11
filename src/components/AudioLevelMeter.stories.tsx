/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, within } from "storybook/test";
import { type JSX } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { AudioLevelMeter } from "./AudioLevelMeter";

const meta = {
  component: AudioLevelMeter,
  // The meter is only ever seen inside the audio menu, so give it a comparable
  // width to judge the bar spacing against.
  decorators: [
    (Story): JSX.Element => (
      <div style={{ width: 300 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AudioLevelMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Silent: Story = {
  args: { state: { type: "active", level: 0 } },
  play: async ({ canvasElement }) => {
    const meter = within(canvasElement).getByRole("meter");
    await expect(meter).toHaveAttribute("aria-valuetext", "No sound detected");
  },
};

export const Speaking: Story = {
  args: { state: { type: "active", level: 0.45 } },
  play: async ({ canvasElement }) => {
    const meter = within(canvasElement).getByRole("meter");
    await expect(meter).toHaveAttribute("aria-valuetext", "Picking up sound");
  },
};

export const Loud: Story = {
  args: { state: { type: "active", level: 0.95 } },
};

export const Unavailable: Story = {
  args: { state: { type: "unavailable" } },
  play: async ({ canvasElement }) => {
    const meter = within(canvasElement).getByRole("meter");
    await expect(meter).toHaveAttribute("data-unavailable", "true");
  },
};

export const NoMicrophone: Story = {
  args: { state: { type: "absent" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("meter")).toBe(null);
    await expect(canvas.getByText(/No microphone found/)).toBeInTheDocument();
  },
};

export const PermissionDenied: Story = {
  args: { state: { type: "denied" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("meter")).toBe(null);
    await expect(
      canvas.getByText(/Microphone access is blocked/),
    ).toBeInTheDocument();
  },
};
