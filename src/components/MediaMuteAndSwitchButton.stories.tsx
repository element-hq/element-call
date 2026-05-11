/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { AdvancedSettingsIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { fn, userEvent, within, expect } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { MediaMuteAndSwitchButton } from "./MediaMuteAndSwitchButton";

const meta = {
  component: MediaMuteAndSwitchButton,
} satisfies Meta<typeof MediaMuteAndSwitchButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "SomeMenu",
    iconsAndLabels: {
      IconEnabled: AdvancedSettingsIcon,
      IconDisabled: AdvancedSettingsIcon,
      enabledLabel: "Enabled",
      disabledLabel: "Disabled",
      optionsButtonLabel: "Options",
    },
    enabled: true,
    options: [
      { label: "option 1", id: "1" },
      { label: "option 2", id: "2" },
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
      { label: "Microphone 1", id: "1" },
      { label: "Microphone 2", id: "2" },
    ],
    toggles: [
      {
        label: "example toggle",
        id: "t0",
        enabled: true,
      },
    ],
    selectedOption: "2",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // Both the mute button and the chevron trigger currently share the aria-label "Edit"
    // (both are TODO placeholders in the component). The mute button is first in the DOM.
    const muteButton = canvas.getByLabelText("Unmute microphone");
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
      { label: "Microphone 1", id: "1" },
      { label: "Microphone 2", id: "2" },
    ],
    toggles: [],
    selectedOption: "2",
  },
};

export const VideoMute: Story = {
  args: {
    title: "Camera",
    iconsAndLabels: "video",
    enabled: false,
    options: [
      { label: "Camera 1", id: "1" },
      { label: "Camera 2", id: "2" },
    ],
    toggles: [],
    selectedOption: "1",
  },
};

export const VideoUnmute: Story = {
  args: {
    title: "Camera",
    iconsAndLabels: "video",
    enabled: true,
    options: [
      { label: "Camera 1", id: "1" },
      { label: "Camera 2", id: "2" },
    ],
    toggles: [
      {
        label: "Blur Background",
        id: "background_blurring",
        enabled: false,
      },
    ],
    selectedOption: "2",
  },
};
