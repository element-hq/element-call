/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn, userEvent, within, expect } from "storybook/test";
import { type JSX } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { MediaMuteAndSwitchButton } from "./MediaMuteAndSwitchButton";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";

const mediaDevices = new MediaDevices(globalScope);

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
