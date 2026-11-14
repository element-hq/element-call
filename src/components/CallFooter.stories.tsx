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
import styles from "./CallFooter.module.css";
import { useStaticViewModel } from "../state/ViewModel";
import { ReactionsSenderContext } from "../reactions/useReactionsSender";
import { type ReactionOption } from "../reactions";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { globalScope } from "../state/ObservableScope";
import { constant } from "../state/Behavior";
import { type LayoutMode } from "../state/LayoutSwitchViewModel";
import { type MediaMenuSnapshot } from "./MediaMenuViewModel";

// consts for tests
const reactionIdentifier = "@user:example.com:DEVICE";
const reactionData = {
  handsRaised$: new BehaviorSubject({}),
  reactions$: new BehaviorSubject({}),
};

const mediaDevices = new MediaDevices(globalScope, {
  controlledAudioDevices: false,
});

function menu(
  kind: "audio" | "video",
  withDevices: boolean,
): MediaMenuSnapshot {
  const device = kind === "audio" ? "Microphone" : "Camera";
  return {
    enabled: true,
    busy: false,
    toggle: fn(),
    options: withDevices
      ? [
          { id: "1", label: { type: "name", name: `${device} 1` } },
          { id: "2", label: { type: "name", name: `${device} 2` } },
        ]
      : [],
    selected: "1",
    select: fn(),
    outputOptions:
      withDevices && kind === "audio"
        ? [
            {
              id: "default",
              label: { type: "default", name: "Built-in Output" },
            },
          ]
        : [],
    selectedOutput: "default",
    selectOutput: fn(),
    backgroundEffect: "none",
    backgroundEffects:
      kind === "video"
        ? [
            { id: "none", kind: "none" },
            { id: "blur", kind: "blur" },
          ]
        : [],
    backgroundEffectNotice: undefined,
    backgroundEffectSettling: false,
    backgroundImageRefusal: undefined,
    selectBackgroundEffect: fn(),
    addBackgroundImage: undefined,
    removeBackgroundEffect: undefined,
    cameraTrack: null,
  };
}

/**
 * A wrapper component that is used for:
 *  - exposing the snapshot via props so the storybook documents the snapshot properties (basically unpack them form the vm)
 *  - constructing the layout switch and the menus' view models; the menus'
 *    own states are in the MediaMenuButton stories
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
  withDevices,
  ...vmSnapshot
}: Omit<FooterSnapshot, "layoutSwitchVm" | "audioMenuVm" | "cameraMenuVm"> & {
  children?: false | JSX.Element | JSX.Element[] | undefined;
  layout: LayoutMode | null;
  setLayout: (value: LayoutMode) => void;
  /** Whether the menus have devices to pick, or are plain mute buttons. */
  withDevices: boolean;
}): ReactNode {
  const audioMenuVm = useStaticViewModel(menu("audio", withDevices));
  const cameraMenuVm = useStaticViewModel(menu("video", withDevices));
  const vm = useStaticViewModel({
    ...vmSnapshot,
    layoutSwitchVm: layout && { layout$: constant(layout), setLayout },
    audioMenuVm,
    cameraMenuVm,
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
    hangup: fnArgType,
  },
} satisfies Meta<typeof CallFooterStoryWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    showLogo: false,
    layout: "grid",
    setLayout: fn(),
    withDevices: false,
    openSettings: fn(),
    toggleScreenSharing: fn(),
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
  },
  parameters: {
    layout: "fullscreen",
  },
};

export const StaysWhileAMenuIsOpen: Story = {
  ...Default,
  args: {
    ...Default.args,
    withDevices: true,
    // In a short window the footer overlays the call and hides itself.
    asOverlay: true,
    showFooter: true,
  },
  play: async ({ canvasElement }): Promise<void> => {
    const footer = canvasElement.querySelector<HTMLElement>(
      '[data-testid="footer-container"]',
    )!;
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Microphone" }),
    );
    await expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    // The call hides the footer with this class.
    footer.classList.add(styles.hidden);

    // Read after the 0.15s fade, not mid-transition.
    await new Promise((settled) => setTimeout(settled, 400));
    await expect(getComputedStyle(footer).opacity).toBe("1");
  },
};

export const WithLogo: Story = {
  ...Default,
  args: {
    ...Default.args,
    showLogo: true,
  },
};

/** Switching to grid, and the footer's own buttons, act. */
export const SpotlightMode: Story = {
  ...Default,
  args: {
    ...Default.args,
    layout: "spotlight",
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Grid" }));
    await expect(args.setLayout).toHaveBeenCalledWith("grid");
    await userEvent.click(canvas.getByRole("switch", { name: "Share screen" }));
    await expect(args.toggleScreenSharing).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "End call" }));
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
    layout: null,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("radio", { name: "Spotlight" }),
    ).not.toBeInTheDocument();
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
