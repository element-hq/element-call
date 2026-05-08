/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, fn, userEvent, within } from "storybook/test";
import { BehaviorSubject } from "rxjs";
import { type JSX, type ReactNode } from "react";
import { Link } from "@vector-im/compound-web";
import {
  useArgs,
  useCallback,
  useEffect,
} from "storybook/internal/preview-api";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { CallFooter, type FooterSnapshot } from "./CallFooter";
import inCallViewStyles from "../room/InCallView.module.css";
import { createMockedViewModel } from "../state/ViewModel";
import { ReactionsSenderContext } from "../reactions/useReactionsSender";
import { type ReactionOption } from "../reactions";
import { GridMode } from "../state/CallViewModel/CallViewModel";
import { constant } from "../state/Behavior";

/**
 * A wrapper component that is used for:
 *  - exposing the snapshot via props so the storybook documents the snapshot properties (basically unpack them form the vm)
 *  - Add additional react context
 * @param props
 * @returns
 */
function CallFooterStoryWrapper(
  props: FooterSnapshot & {
    children?: false | JSX.Element | JSX.Element[] | undefined;
  },
): ReactNode {
  const { children, ...vmProps } = props;
  const vm = createMockedViewModel(vmProps);
  return (
    <div /*className={inCallViewStyles.inRoom}*/>
      <ReactionsSenderContext
        value={{
          supportsReactions: false,
          toggleRaisedHand: async () => Promise.resolve(),
          sendReaction: async (reaction: ReactionOption) => Promise.resolve(),
        }}
      >
        <CallFooter vm={vm} />
      </ReactionsSenderContext>
    </div>
  );
}

const meta = {
  component: CallFooterStoryWrapper,
} satisfies Meta<typeof CallFooterStoryWrapper>;

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
    showLogo: false,
    layoutMode: "grid",
    audioEnabled: true,
    videoEnabled: true,
    setLayoutMode: fn(),
    openSettings: fn(),
    toggleAudio: fn(),
    toggleVideo: fn(),
    toggleScreenSharing: fn(),
    hangup: fn(),
    buttonSize: "lg",
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

export const WithAudioAndVideoOptions: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: false,
    videoEnabled: true,
    audioOptions: [
      { label: "Microphone 1", id: "1" },
      { label: "Microphone 2", id: "2" },
    ],
    videoOptions: [
      { label: "Camera 1", id: "1" },
      { label: "Camera 2", id: "2" },
    ],
    selectedAudio: "2",
    selectedVideo: "1",
  },
};
export const WithLogo: Story = {
  ...Default,
  args: {
    ...Default.args,
    showLogo: true,
  },
};

export const AudioVideoEnabled: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: true,
    videoEnabled: true,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const spotlightRadio = canvas.getByRole("radio", { name: "Spotlight" });
    await userEvent.click(spotlightRadio);
    await expect(args.setLayoutMode).toHaveBeenCalledWith("spotlight");

    const micButtonMute = canvas.getByRole("switch", {
      name: "Mute microphone",
    });
    await userEvent.click(micButtonMute);
    await expect(args.toggleAudio).toHaveBeenCalled();

    const videoMuteButton = canvas.getByRole("switch", {
      name: "Stop video",
    });
    await userEvent.click(videoMuteButton);
    await expect(args.toggleVideo).toHaveBeenCalled();
    const screenShare = canvas.getByRole("switch", {
      name: "Share screen",
    });
    await userEvent.click(screenShare);
    await expect(args.toggleScreenSharing).toHaveBeenCalled();
    const endCall = canvas.getByRole("button", {
      name: "End call",
    });
    await userEvent.click(endCall);
    await expect(args.hangup).toHaveBeenCalled();
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
    buttonSize: "md",
    showSettingsButton: false,
    layoutMode: undefined,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("radio", { name: "Spotlight" }),
    ).not.toBeInTheDocument();

    const micButtonMute = canvas.getByRole("switch", {
      name: "Mute microphone",
    });
    await userEvent.click(micButtonMute);
    await expect(args.toggleAudio).toHaveBeenCalled();

    const videoMuteButton = canvas.getByRole("switch", {
      name: "Stop video",
    });
    await userEvent.click(videoMuteButton);
    await expect(args.toggleVideo).toHaveBeenCalled();
    const screenShare = canvas.getByRole("switch", {
      name: "Share screen",
    });
    await userEvent.click(screenShare);
    await expect(args.toggleScreenSharing).toHaveBeenCalled();
    const endCall = canvas.getByRole("button", {
      name: "End call",
    });
    await userEvent.click(endCall);
    await expect(args.hangup).toHaveBeenCalled();
  },
};
export const NoControlsWithLogo: Story = {
  ...Default,
  args: {
    ...Default.args,
    hideControls: true,
    showLogo: true,
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
    audioEnabled: false,
    videoEnabled: false,
    toggleAudio: undefined,
    toggleVideo: undefined,
    audioOutputSwitcher: undefined,
  },
};

export const MobileLayout: Story = {
  ...Default,
  args: {
    ...Default.args,
    showLogo: false,

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
    showLogo: false,
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
    showLogo: false,

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
    showLogo: false,
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
    showLogo: false,
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
