/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, fn, userEvent, within } from "storybook/test";
import { type JSX, type ReactNode } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { AudioMenuButton } from "./AudioMenuButton";
import {
  type DeviceMenuSnapshot,
  type OutputMenuSnapshot,
} from "./MediaMenuViewModel";
import { useStaticViewModel } from "../state/ViewModel";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";

const mediaDevices = new MediaDevices(globalScope, {
  controlledAudioDevices: false,
});

/** Builds the view model from the story's args, so each field is a control. */
function AudioMenuButtonStoryWrapper({
  output,
  ...device
}: DeviceMenuSnapshot & { output: OutputMenuSnapshot }): ReactNode {
  const deviceVm = useStaticViewModel(device);
  const outputVm = useStaticViewModel(output);
  return (
    <AudioMenuButton
      vm={{ ...deviceVm, kind: "audio", output: outputVm }}
      size="lg"
    />
  );
}

const meta = {
  component: AudioMenuButtonStoryWrapper,
  decorators: [
    (Story): JSX.Element => (
      <MediaDevicesContext value={mediaDevices}>
        <Story />
      </MediaDevicesContext>
    ),
  ],
} satisfies Meta<typeof AudioMenuButtonStoryWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Microphone: Story = {
  args: {
    enabled: true,
    busy: false,
    toggle: fn(),
    options: [
      { id: "mic1", label: { type: "name", name: "Microphone 1" } },
      { id: "mic2", label: { type: "name", name: "Microphone 2" } },
    ],
    selected: "mic1",
    select: fn(),
    output: {
      options: [
        {
          id: "default",
          label: { type: "default", name: "Built-in Output" },
        },
      ],
      selected: "default",
      select: fn(),
    },
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("switch", { name: "Mute microphone" }),
    );
    await expect(args.toggle).toHaveBeenCalled();
  },
};

/** No microphones to pick and none to mute: a plain, disabled mute button. */
export const WithoutDevices: Story = {
  args: {
    ...Microphone.args,
    enabled: false,
    toggle: undefined,
    options: [],
    output: { options: [], selected: undefined, select: undefined },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Microphone" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByTestId("incall_mute")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};
