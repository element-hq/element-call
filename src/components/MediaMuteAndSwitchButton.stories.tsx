/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  MicOnSolidIcon,
  MicOffSolidIcon,
  VideoCallSolidIcon,
  VideoCallOffSolidIcon,
  AdvancedSettingsIcon,
  VideoCallIcon,
  MicOnIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

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
    IconEnabled: AdvancedSettingsIcon,
    IconDisabled: AdvancedSettingsIcon,
    enabled: true,
    options: [
      { label: "option 1", id: "1" },
      { label: "option 2", id: "2" },
    ],
    selectedOption: "1",
  },
};

export const AudioMute: Story = {
  args: {
    title: "Microphone",
    IconEnabled: MicOnSolidIcon,
    IconDisabled: MicOffSolidIcon,
    IconOptions: MicOnIcon,
    enabled: false,
    options: [
      { label: "Microphone 1", id: "1" },
      { label: "Microphone 2", id: "2" },
    ],
    selectedOption: "2",
  },
};

export const AudioUnmute: Story = {
  args: {
    title: "Microphone",
    IconEnabled: MicOnSolidIcon,
    IconDisabled: MicOffSolidIcon,
    IconOptions: MicOnIcon,
    enabled: true,
    options: [
      { label: "Microphone 1", id: "1" },
      { label: "Microphone 2", id: "2" },
    ],
    selectedOption: "2",
  },
};

export const VideoMute: Story = {
  args: {
    title: "Camera",
    IconEnabled: VideoCallSolidIcon,
    IconDisabled: VideoCallOffSolidIcon,
    IconOptions: VideoCallIcon,
    enabled: false,
    options: [
      { label: "Camera 1", id: "1" },
      { label: "Camera 2", id: "2" },
    ],
    selectedOption: "1",
  },
};

export const VideoUnmute: Story = {
  args: {
    title: "Camera",
    IconEnabled: VideoCallSolidIcon,
    IconDisabled: VideoCallOffSolidIcon,
    IconOptions: VideoCallIcon,
    enabled: true,
    options: [
      { label: "Camera 1", id: "1" },
      { label: "Camera 2", id: "2" },
    ],
    toggles: [
      {
        label: "background blurring",
        id: "background_blurring",
        enabled: false,
      },
    ],
    selectedOption: "2",
  },
};
