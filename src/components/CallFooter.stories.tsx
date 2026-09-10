/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, fn, screen, userEvent, within } from "storybook/test";
import { BehaviorSubject } from "rxjs";
import { type JSX, type ReactNode } from "react";
import { Link } from "@vector-im/compound-web";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { CallFooter, type FooterSnapshot } from "./CallFooter";
import inCallViewStyles from "../room/InCallView.module.css";
import { useStaticViewModel } from "../state/ViewModel";
import { ReactionsSenderContext } from "../reactions/useReactionsSender";
import { type ReactionOption } from "../reactions";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";
import { constant } from "../state/Behavior";
import { type LayoutMode } from "../state/LayoutSwitchViewModel";

// consts for tests
const reactionIdentifier = "@user:example.com:DEVICE";
const reactionData = {
  handsRaised$: new BehaviorSubject({}),
  reactions$: new BehaviorSubject({}),
};

const mediaDevices = new MediaDevices(globalScope, {
  controlledAudioDevices: false,
});

/**
 * A wrapper component that is used for:
 *  - exposing the snapshot via props so the storybook documents the snapshot properties (basically unpack them form the vm)
 *  - constructing the layout switch view model
 *  - Add additional react context
 * The paraeters are all params from the FooterSnapshot,
 * the Snapshot of the vm, the wrapper will create a mocked vm from it and pass it to the CallFooter.
 * `children` is used for the "Back to Recents" button in the lobby stories, but can be used for anything really.
 * @returns A component that renders the CallFooter based on primitive snapshot params (not a view model). Which is what we want for storybook.
 */
function CallFooterStoryWrapper({
  children,
  layout,
  setLayout,
  ...vmSnapshot
}: Omit<FooterSnapshot, "layoutSwitchVm"> & {
  children?: false | JSX.Element | JSX.Element[] | undefined;
  layout: LayoutMode | null;
  setLayout: (value: LayoutMode) => void;
}): ReactNode {
  const vm = useStaticViewModel({
    ...vmSnapshot,
    layoutSwitchVm: layout && { layout$: constant(layout), setLayout },
  });
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

const fnArgType = {
  control: { type: "select" as const },
  options: ["MockedCallback", "undefined"],
  mapping: { MockedCallback: fn(), undefined: undefined },
};

const meta = {
  component: CallFooterStoryWrapper,
  argTypes: {
    layout: {
      control: "radio",
      options: ["grid", "spotlight"] satisfies LayoutMode[],
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
    openSettings: fnArgType,
    toggleAudio: fnArgType,
    toggleVideo: fnArgType,
    hangup: fnArgType,
    selectAudioOutputOption: fnArgType,
    setSoundEffectVolume: fnArgType,
  },
} satisfies Meta<typeof CallFooterStoryWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    showLogo: false,
    layout: "grid",
    setLayout: fn(),
    audioEnabled: true,
    audioBusy: false,
    videoEnabled: true,
    videoBusy: false,
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
    showModals: true,
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
    audioOutputOptions: [],
    selectedAudioOutput: undefined,
    selectAudioOutputOption: undefined,
    soundEffectVolume: 0.5,
    setSoundEffectVolume: undefined,
  },
  parameters: {
    layout: "fullscreen",
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
    await expect(args.setLayout).toHaveBeenCalledWith("spotlight");

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
    layout: "spotlight",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const spotlightRadio = canvas.getByRole("radio", { name: "Grid" });
    await userEvent.click(spotlightRadio);
    await expect(args.setLayout).toHaveBeenCalledWith("grid");
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
    layout: null,
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
    layout: null,
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

    layout: null,
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
    layout: null,
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
    layout: null,
    toggleScreenSharing: undefined,
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    ...Default.parameters,
  },
};

/** The microphone chevron opens the audio menu: microphones and speakers. */
export const WithAudioMenu: Story = {
  ...Default,
  args: {
    ...Default.args,
    audioEnabled: true,
    audioOptions: [
      { label: { type: "name", name: "MacBook Pro Microphone" }, id: "1" },
      { label: { type: "name", name: "Jabra Evolve 65" }, id: "2" },
    ],
    selectedAudio: "1",
    selectAudioButtonOption: fn(),
    audioOutputOptions: [
      { label: { type: "default", name: "MacBook Pro Speakers" }, id: "" },
      { label: { type: "name", name: "Jabra Evolve 65" }, id: "2" },
    ],
    selectedAudioOutput: "",
    selectAudioOutputOption: fn(),
    setSoundEffectVolume: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));

    const menu = within(await screen.findByRole("menu"));
    await expect(
      menu.getByRole("heading", { name: "Audio controls" }),
    ).toBeInTheDocument();
    // The headset appears in both groups under the same name, as a real one
    // does. The speaker rows are the scroll area's own children; the
    // microphone rows sit one level deeper, inside their group.
    const scroll = menu.getByTestId("audio_menu_scroll");
    const outputs = [...scroll.children].filter(
      (el) => el.getAttribute("role") === "menuitemradio",
    );
    await userEvent.click(outputs[1]);
    await expect(args.selectAudioOutputOption).toHaveBeenCalledWith("2");
    // The menu stays open after a selection.
    await expect(screen.getByRole("menu")).toBeInTheDocument();
    await expect(
      menu.getByRole("slider", { name: /Sound effect volume/ }),
    ).toBeInTheDocument();
  },
};

/** One output only: the speaker group names it without offering a choice. */
export const WithSingleAudioOutput: Story = {
  ...WithAudioMenu,
  args: {
    ...WithAudioMenu.args,
    audioOutputOptions: [
      { label: { type: "default", name: "MacBook Pro Speakers" }, id: "" },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));

    await expect(
      await screen.findByTestId("speaker_readonly"),
    ).toHaveTextContent("MacBook Pro Speakers");
    await expect(
      screen.queryByRole("menuitemradio", { name: /Speakers/ }),
    ).toBe(null);
  },
};

/**
 * More devices than fit on screen: the heading and the slider stay put while
 * the device lists scroll between them.
 */
export const WithManyDevices: Story = {
  ...WithAudioMenu,
  args: {
    ...WithAudioMenu.args,
    audioOptions: Array.from({ length: 12 }, (_, i) => ({
      label: { type: "name", name: `Microphone ${i + 1} (USB Audio Device)` },
      id: `mic-${i}`,
    })),
    selectedAudio: "mic-0",
    audioOutputOptions: Array.from({ length: 8 }, (_, i) => ({
      label: { type: "name", name: `Speaker ${i + 1} (DisplayPort)` },
      id: `out-${i}`,
    })),
    selectedAudioOutput: "out-0",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Microphone" }));
    const menu = await screen.findByRole("menu");
    const heading = within(menu).getByRole("heading", {
      name: "Audio controls",
    });
    const slider = within(menu).getByRole("slider");
    const scroll = within(menu).getByTestId("audio_menu_scroll");

    // The menu slides in; measure once it has settled.
    await Promise.all(
      menu.getAnimations({ subtree: true }).map(async (a) => a.finished),
    );

    // The whole menu is on screen, so the heading and the slider are too.
    const menuBox = menu.getBoundingClientRect();
    await expect(menuBox.top).toBeGreaterThanOrEqual(0);
    await expect(menuBox.bottom).toBeLessThanOrEqual(window.innerHeight);
    await expect(heading.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    await expect(slider.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
    // Only the device lists scroll.
    await expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  },
};
