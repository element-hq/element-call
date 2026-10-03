/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, within } from "storybook/test";
import { type JSX, useMemo } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { GridTile } from "./GridTile";
import { GridTileViewModel } from "../state/TileViewModel";
import { constant } from "../state/Behavior";
import { createUnknownParticipantMedia } from "../state/media/UnknownParticipantMediaViewModel";

interface UnknownParticipantTileStoryProps {
  width: number;
  height: number;
  rtcBackendIdentity: string;
  showNameTags: boolean;
  showOutline: boolean;
}

/**
 * Renders a GridTile for a LiveKit participant that maps to no MatrixRTC
 * member, driven by primitive props so that Storybook can document them.
 */
function UnknownParticipantTile({
  width,
  height,
  rtcBackendIdentity,
  ...props
}: UnknownParticipantTileStoryProps): JSX.Element {
  const vm = useMemo(
    () =>
      new GridTileViewModel(
        constant(
          createUnknownParticipantMedia({
            id: `unknown:https://rtc.example.org:${rtcBackendIdentity}`,
            rtcBackendIdentity,
            focusUrl: "https://rtc.example.org",
          }),
        ),
      ),
    [rtcBackendIdentity],
  );
  return (
    <GridTile
      vm={vm}
      onOpenProfile={null}
      targetWidth={width}
      targetHeight={height}
      style={{ width, height }}
      showSpeakingIndicators={false}
      showRingingStatus={false}
      focusable
      {...props}
    />
  );
}

const meta = {
  component: UnknownParticipantTile,
  argTypes: {
    width: { control: { type: "range", min: 80, max: 800, step: 10 } },
    height: { control: { type: "range", min: 80, max: 600, step: 10 } },
  },
} satisfies Meta<typeof UnknownParticipantTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnknownParticipant: Story = {
  args: {
    width: 400,
    height: 300,
    rtcBackendIdentity: "@rogue:example.org:DEVICE",
    showNameTags: true,
    showOutline: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Unknown participant")).toBeInTheDocument();
    await expect(
      canvas.queryByText("@rogue:example.org:DEVICE"),
    ).not.toBeInTheDocument();
  },
};

/** Narrow tiles hide the name tag, so the label goes with it. */
export const UnknownParticipantNarrow: Story = {
  args: {
    ...UnknownParticipant.args,
    width: 90,
    height: 90,
  },
};
