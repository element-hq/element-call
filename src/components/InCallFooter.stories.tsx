/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn } from "storybook/test";
import { BehaviorSubject } from "rxjs";
import { type ReactNode } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { InCallFooter, type InCallFooterProps } from "./InCallFooter";
import inCallViewStyles from "../room/InCallView.module.css";

function InCallFooterWrapper(props: InCallFooterProps): ReactNode {
  return (
    <div className={inCallViewStyles.inRoom}>
      <InCallFooter {...props} />
    </div>
  );
}

const meta = {
  component: InCallFooterWrapper,
} satisfies Meta<typeof InCallFooterWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    asOverlay: false,
    showFooter: true,
    showControls: true,
    showSettingsButton: true,
    showLogo: false,
    asPip: false,
    gridMode: "grid",
    audioEnabled: true,
    videoEnabled: true,
    sharingScreen: false,
    supportsReactions: false,
    audioOutputSwitcher: null,
    debugTileLayout: false,
    tileStoreGeneration: 0,
    reactionData: {
      handsRaised$: new BehaviorSubject({}),
      reactions$: new BehaviorSubject({}),
    },
    reactionIdentifier: "@user:example.com:DEVICE",
    setGridMode: fn(),
    openSettings: fn(),
    toggleAudio: fn(),
    toggleVideo: fn(),
    toggleScreenSharing: fn(),
    hangup: fn(),
  },
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    gridMode: { control: "radio", options: ["grid", "spotlight"] },
    audioOutputSwitcher: {
      control: "radio",
      options: ["noOutputSwitcher", "earpiece", "speaker"],
      mapping: {
        noOutputSwitcher: null,
        // This is inverersed (speaker<->earpice) because the switcher object stores the target output, not the current one.
        earpiece: { targetOutput: "speaker", switch: fn() },
        speaker: { targetOutput: "earpiece", switch: fn() },
      },
    },
  },
};

export const WithLogo: Story = {
  ...Default,
  args: {
    ...Default.args,
    showLogo: true,
  },
};
export const WithAudioOutput: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioOutputSwitcher: { targetOutput: "speaker", switch: fn() },
  },
};
export const Pip: Story = {
  ...Default,
  args: {
    ...Default.args,
    asPip: true,
  },
};

export const NoControlsWithLogo: Story = {
  ...Default,
  args: {
    ...Default.args,
    showControls: false,
    showLogo: true,
  },
};

export const DebugData: Story = {
  ...Default,
  args: {
    ...Default.args,
    debugTileLayout: true,
    tileStoreGeneration: 74,
    audioOutputSwitcher: null,
  },
};
export const MobileLayout: Story = {
  ...Default,
  args: {
    ...Default.args,
    showLogo: true,
    debugTileLayout: true,
    tileStoreGeneration: 74,
    audioOutputSwitcher: null,
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    ...Default.parameters,
  },
};
