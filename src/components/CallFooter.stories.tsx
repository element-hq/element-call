/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, fn, userEvent, within } from "storybook/test";
import { BehaviorSubject } from "rxjs";
import { type JSX, type ReactNode } from "react";
import { Link } from "@vector-im/compound-web";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { CallFooter, type FooterSnapshot } from "./CallFooter";
import inCallViewStyles from "../room/InCallView.module.css";
import { useStaticViewModel } from "../state/ViewModel";
import { ReactionsSenderContext } from "../reactions/useReactionsSender";
import { type ReactionOption } from "../reactions";
import { type GridMode } from "../state/CallViewModel/CallViewModel";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";
// consts for tests
const reactionIdentifier = "@user:example.com:DEVICE";
const reactionData = {
  handsRaised$: new BehaviorSubject({}),
  reactions$: new BehaviorSubject({}),
};

const mediaDevices = new MediaDevices(globalScope);

/**
 * A wrapper component that is used for:
 *  - exposing the snapshot via props so the storybook documents the snapshot properties (basically unpack them form the vm)
 *  - Add additional react context
 * The paraeters are all params from the FooterSnapshot,
 * the Snapshot of the vm, the wrapper will create a mocked vm from it and pass it to the CallFooter.
 * `children` is used for the "Back to Recents" button in the lobby stories, but can be used for anything really.
 * @returns A component that renders the CallFooter based on primitive snapshot params (not a view model). Which is what we want for storybook.
 */
function CallFooterStoryWrapper({
  children,
  ...vmSnapshot
}: FooterSnapshot & {
  children?: false | JSX.Element | JSX.Element[] | undefined;
}): ReactNode {
  const vm = useStaticViewModel(vmSnapshot);
  return (
    <MediaDevicesContext value={mediaDevices}>
      <div className={inCallViewStyles.inRoom}>
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
    </MediaDevicesContext>
  );
}

const meta = {
  component: CallFooterStoryWrapper,
} satisfies Meta<typeof CallFooterStoryWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

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
    audioBusy: false,
    videoEnabled: true,
    videoBusy: false,
    setLayoutMode: fn(),
    openSettings: fn(),
    toggleAudio: fn(),
    toggleVideo: fn(),
    toggleScreenSharing: fn(),
    toggleBlur: fn(),
    videoBlurEnabled: true,
    hangup: fn(),
    buttonSize: "lg",
    showFooter: true,
    hideControls: false,
    asOverlay: false,
    sharingScreen: false,
    audioOutputSwitcher: undefined,
    reactionIdentifier: undefined,
    reactionData: undefined,
    debugTileLayout: false,
    tileStoreGeneration: undefined,
    audioOptions: [],
    videoOptions: [],
    selectedAudio: undefined,
    selectedVideo: undefined,
    selectAudioButtonOption: undefined,
    selectVideoButtonOption: undefined,
  },
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    layoutMode: {
      control: "radio",
      options: ["grid", "spotlight"] satisfies GridMode[],
    },
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
      { label: { type: "name", name: "Microphone 1" }, id: "1" },
      { label: { type: "name", name: "Microphone 2" }, id: "2" },
    ],
    videoOptions: [
      { label: { type: "name", name: "Camera 1" }, id: "1" },
      { label: { type: "name", name: "Camera 2" }, id: "2" },
    ],
    selectedAudio: "2",
    selectedVideo: "1",
  },
};

export const AudioBusy: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: true,
    audioBusy: true,
    videoEnabled: true,
  },
};

export const VideoBusy: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: true,
    videoEnabled: true,
    videoBusy: true,
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

/** used to test switching to grid mode */
export const SpotlightMode: Story = {
  ...Default,
  args: {
    ...Default.args,
    layoutMode: "spotlight",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const spotlightRadio = canvas.getByRole("radio", { name: "Grid" });
    await userEvent.click(spotlightRadio);
    await expect(args.setLayoutMode).toHaveBeenCalledWith("grid");
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
    layoutMode: undefined,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.queryByRole("radio", { name: "Spotlight" }),
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
