/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, fn, userEvent, within } from "storybook/test";
import { type JSX, type ReactNode } from "react";
import { type LocalVideoMediaTrack } from "@element-hq/matrixrtc-sdk";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { CameraMenuButton } from "./CameraMenuButton";
import {
  type BackgroundEffectsMenuSnapshot,
  type DeviceMenuSnapshot,
} from "./MediaMenuViewModel";
import { useStaticViewModel } from "../state/ViewModel";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";

const mediaDevices = new MediaDevices(globalScope, {
  controlledAudioDevices: false,
});

type StoryArgs = DeviceMenuSnapshot & {
  backgroundEffects: BackgroundEffectsMenuSnapshot;
  cameraTrack: LocalVideoMediaTrack | null;
};

/** Builds the view model from the story's args, so each field is a control. */
function CameraMenuButtonStoryWrapper({
  backgroundEffects,
  cameraTrack,
  ...device
}: StoryArgs): ReactNode {
  const deviceVm = useStaticViewModel(device);
  const backgroundEffectsVm = useStaticViewModel(backgroundEffects);
  const { cameraTrack$ } = useStaticViewModel({ cameraTrack });
  return (
    <CameraMenuButton
      vm={{
        ...deviceVm,
        kind: "video",
        backgroundEffects: backgroundEffectsVm,
        cameraTrack$,
      }}
      size="lg"
    />
  );
}

const meta = {
  component: CameraMenuButtonStoryWrapper,
  decorators: [
    (Story): JSX.Element => (
      <MediaDevicesContext value={mediaDevices}>
        <Story />
      </MediaDevicesContext>
    ),
  ],
} satisfies Meta<typeof CameraMenuButtonStoryWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

const noBackgroundEffects: BackgroundEffectsMenuSnapshot = {
  selected: "none",
  available: [],
  notice: undefined,
  settling: false,
  imageRefusal: undefined,
  select: undefined,
  addImage: undefined,
  remove: undefined,
};

const cameraEffects: BackgroundEffectsMenuSnapshot = {
  ...noBackgroundEffects,
  available: [
    { id: "none", kind: "none" },
    { id: "blur", kind: "blur" },
  ],
  select: fn(),
};

export const Camera: Story = {
  args: {
    cameraTrack: null,
    enabled: true,
    busy: false,
    toggle: fn(),
    options: [{ id: "cam1", label: { type: "name", name: "Camera 1" } }],
    selected: "cam1",
    select: fn(),
    backgroundEffects: cameraEffects,
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("switch", { name: "Stop video" }),
    );
    await expect(args.toggle).toHaveBeenCalled();
  },
};

export const CameraBusy: Story = {
  args: { ...Camera.args, busy: true },
};

/** Opens the effects, for the stories that check what they say. */
async function openEffects(canvasElement: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(
    within(canvasElement).getByRole("button", { name: "Camera" }),
  );
  return within(document.body).findByRole("group", {
    name: "Background effects",
  });
}

/** The view model says why; the view says it in words. */
export const CameraEffectsUnavailable: Story = {
  args: {
    ...Camera.args,
    backgroundEffects: {
      ...cameraEffects,
      select: undefined,
      notice: "unavailable",
    },
  },
  play: async ({ canvasElement }) => {
    const section = await openEffects(canvasElement);
    await expect(
      within(section).getByRole("group"),
    ).toHaveAccessibleDescription(
      "Background effects are not supported on this platform.",
    );
  },
};

export const CameraEffectsSlow: Story = {
  args: {
    ...Camera.args,
    backgroundEffects: { ...cameraEffects, notice: "slow" },
  },
  play: async ({ canvasElement }) => {
    const section = await openEffects(canvasElement);
    await expect(
      within(section).getByRole("group"),
    ).toHaveAccessibleDescription(
      "Background effects run slowly on this platform, which may cause your video to stutter.",
    );
  },
};

export const CameraFileRefused: Story = {
  args: {
    ...Camera.args,
    backgroundEffects: {
      ...cameraEffects,
      addImage: fn(),
      imageRefusal: { reason: "not-an-image" },
    },
  },
  play: async ({ canvasElement }) => {
    await openEffects(canvasElement);
    await expect(
      await within(document.body).findByText(
        "That file is not a supported image",
      ),
    ).toBeInTheDocument();
  },
};

/** No devices to pick and none to mute: a plain, disabled mute button. */
export const WithoutDevices: Story = {
  args: {
    ...Camera.args,
    enabled: false,
    toggle: undefined,
    options: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Camera" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByTestId("incall_videomute")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};
