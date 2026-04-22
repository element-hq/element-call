/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn } from "storybook/test";
import { BehaviorSubject } from "rxjs";
import { type ReactNode } from "react";
import { Link } from "@vector-im/compound-web";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { CallFooter, type FooterProps } from "./CallFooter";
import inCallViewStyles from "../room/InCallView.module.css";
import { ReactionsSenderContext } from "../reactions/useReactionsSender";
import { type ReactionOption } from "../reactions";

function CallFooterWrapper(props: FooterProps): ReactNode {
  return (
    <div className={inCallViewStyles.inRoom}>
      <ReactionsSenderContext
        value={{
          supportsReactions: false,
          toggleRaisedHand: async () => Promise.resolve(),
          sendReaction: async (reaction: ReactionOption) => Promise.resolve(),
        }}
      >
        <CallFooter {...props} />
      </ReactionsSenderContext>
    </div>
  );
}

const meta = {
  component: CallFooterWrapper,
} satisfies Meta<typeof CallFooterWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

const reactionIdentifier = "@user:example.com:DEVICE";
const reactionData = {
  handsRaised$: new BehaviorSubject({}),
  reactions$: new BehaviorSubject({}),
};

const fnArgType = {
  control: { type: "select" as const },
  options: ["MockedCallback", "undefined"],
  mapping: { MockedCallback: fn(), undefined: undefined },
};
export const Default: Story = {
  args: {
    hideLogo: true,
    layoutMode: "grid",
    audioEnabled: true,
    videoEnabled: true,
    setLayoutMode: fn(),
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
    layoutMode: { control: "radio", options: ["grid", "spotlight"] },
    audioOutputSwitcher: {
      control: "select",
      options: ["NoOutputCallback", "speaker", "earpiece"],
      table: { defaultValue: { summary: "NoOutputCallback" } },
      mapping: {
        NoOutputCallback: undefined,
        // This is inverersed (speaker<->earpice) because the switcher object stores the target output, not the current one.
        speaker: { targetOutput: "earpiece", switch: fn() },
        earpiece: { targetOutput: "speaker", switch: fn() },
      },
    },
    toggleScreenSharing: fnArgType,
    setLayoutMode: fnArgType,
    openSettings: fnArgType,
    toggleAudio: fnArgType,
    toggleVideo: fnArgType,
    hangup: fnArgType,
  },
};

export const WithLogo: Story = {
  ...Default,
  args: {
    ...Default.args,
    hideLogo: false,
  },
};

export const AudioVideoEnabled: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: true,
    videoEnabled: true,
  },
};

export const WithAudioOutputSpeaker: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioOutputSwitcher: { targetOutput: "earpiece", switch: fn() },
  },
};

export const WithAudioOutputEarpiece: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioOutputSwitcher: { targetOutput: "speaker", switch: fn() },
  },
};
export const WithReactions: Story = {
  ...Default,
  args: {
    ...Default.args,
    reactionIdentifier,
    reactionData,
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
    hideControls: true,
    hideLogo: false,
  },
};

export const DebugData: Story = {
  ...Default,
  args: {
    ...Default.args,
    debugTileLayout: true,
    tileStoreGeneration: 74,
  },
};

export const UnavailableMediaDevices: Story = {
  ...Default,
  args: {
    ...Default.args,
    toggleAudio: undefined,
    toggleVideo: undefined,
    audioOutputSwitcher: undefined,
  },
};

export const MobileLayout: Story = {
  ...Default,
  args: {
    ...Default.args,
    hideLogo: true,

    audioOutputSwitcher: { targetOutput: "speaker", switch: fn() },
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    ...Default.parameters,
  },
};

export const Lobby: Story = {
  ...Default,
  args: {
    ...Default.args,
    hideLogo: true,
    openSettings: undefined,
    setLayoutMode: undefined,
    toggleScreenSharing: undefined,
  },
  parameters: {
    ...Default.parameters,
  },
};

export const LobbyMobile: Story = {
  ...Default,
  args: {
    ...Default.args,
    hideLogo: true,

    setLayoutMode: undefined,
    toggleScreenSharing: undefined,
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    ...Default.parameters,
  },
};

export const LobbyRecentButton: Story = {
  ...Default,
  args: {
    ...Default.args,
    children: <Link>Back To Recents</Link>,
    hideLogo: true,
    setLayoutMode: undefined,
    toggleScreenSharing: undefined,
  },
  parameters: {
    ...Default.parameters,
  },
};

export const LobbyRecentButtonMobile: Story = {
  ...Default,
  args: {
    ...Default.args,
    children: <Link>Back To Recents</Link>,
    hideLogo: true,
    setLayoutMode: undefined,
    toggleScreenSharing: undefined,
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    ...Default.parameters,
  },
};
