/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeaveToHomeProvider } from "../LeaveToHomeContext";
import { TooltipProvider } from "@vector-im/compound-web";
import { type MatrixClient } from "matrix-js-sdk";
import { axe } from "vitest-axe";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { LobbyView } from "./LobbyView";
import { type LobbyJoinState } from "./LobbyJoinState";
import { E2eeType } from "../e2ee/e2eeType";
import { mockMediaDevices, mockMuteStates } from "../utils/test";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type ProcessorState } from "../livekit/TrackProcessorContext";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import lobbyStyles from "./LobbyView.module.css";
import headerStyles from "../Header.module.css";
import { AppBar } from "../AppBar";

// Somewhere to go home to, so that the lobby offers the way back
const leaveToHome = vi.fn();

vi.mock("@livekit/components-react", () => ({
  usePreviewTracks: (): unknown[] => [],
}));

vi.mock("../livekit/TrackProcessorContext", () => ({
  useTrackProcessor: (): ProcessorState => ({
    supported: false,
    processor: undefined,
  }),
  useTrackProcessorSync: (): void => {},
}));

vi.mock("react-use-measure", () => ({
  default: (): [() => void, object] => [(): void => {}, {}],
}));

vi.mock("../settings/SettingsModal", () => ({
  SettingsModal: (): null => null,
  defaultSettingsTab: "general",
}));

const mockClient = {
  getUserId: () => "@user:example.org",
  getDeviceId: () => "DEVICE",
} as Partial<MatrixClient> as MatrixClient;

const platformMock = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../Platform", () => ({
  get platform(): string {
    return platformMock();
  },
}));

const matrixInfo = {
  userId: "@user:example.org",
  displayName: "Test User",
  avatarUrl: "",
  roomId: "!room:example.org",
  roomName: "Test Room",
  roomAlias: null,
  roomAvatar: null,
  e2eeSystem: { kind: E2eeType.NONE } satisfies EncryptionSystem,
};

function renderLobbyView(
  props: Partial<Parameters<typeof LobbyView>[0]> = {},
  withAppBar = false,
  platform = "android",
): ReturnType<typeof render> {
  platformMock.mockReturnValue(platform);
  const mediaDevices = mockMediaDevices({});
  const muteStates = mockMuteStates();
  const hideHeader = withAppBar ? true : false;
  const lobbyView = (
    <LobbyView
      client={mockClient}
      matrixInfo={matrixInfo}
      muteStates={muteStates}
      joinState={{ kind: "can-join", join: () => {} }}
      confineToRoom={false}
      hideHeader={hideHeader}
      participantCount={3}
      onShareClick={null}
      {...props}
    />
  );
  return render(
    <LeaveToHomeProvider value={leaveToHome}>
      <MediaDevicesContext value={mediaDevices}>
        <TooltipProvider>
          {withAppBar && <AppBar>{lobbyView}</AppBar>}
          {!withAppBar && lobbyView}
        </TooltipProvider>
      </MediaDevicesContext>
    </LeaveToHomeProvider>,
  );
}

describe("LobbyView", () => {
  it("renders with header and participant count", async () => {
    const { container } = renderLobbyView();
    expect(container).toMatchSnapshot();
    expect(
      container.getElementsByClassName(headerStyles.header).length,
    ).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders without header", () => {
    const { container } = renderLobbyView({ hideHeader: true });
    const els = container.getElementsByClassName(headerStyles.header);
    for (const el of els) {
      expect(el).not.toBeVisible();
    }
  });

  it("renders with AppBar android", async () => {
    const { container, getByRole } = renderLobbyView(
      { joinState: { kind: "waiting-for-approval" } },
      true,
      "android",
    );
    getByRole("banner");
    // Check that the primary button uses ArrowLeftIcon (the back/return icon),
    // not the default CollapseIcon
    const { container: iconContainer } = render(<ArrowLeftIcon />);
    const expectedSvgPath = iconContainer
      .querySelector("path")!
      .getAttribute("d");
    const primaryButtonSvgPath = container
      .querySelector("path")
      ?.getAttribute("d");
    expect(primaryButtonSvgPath).toBe(expectedSvgPath);
    expect(container).toMatchSnapshot();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders with AppBar ios", async () => {
    const { container, getByRole } = renderLobbyView(
      { joinState: { kind: "waiting-for-approval" } },
      true,
      "ios",
    );
    getByRole("banner");
    // Check that the primary button uses ArrowLeftIcon (the back/return icon),
    // not the default CollapseIcon
    const { container: iconContainer } = render(<ChevronLeftIcon />);
    const expectedSvgPath = iconContainer
      .querySelector("path")!
      .getAttribute("d");
    const primaryButtonSvgPath = container
      .querySelector("path")
      ?.getAttribute("d");
    expect(primaryButtonSvgPath).toBe(expectedSvgPath);
    expect(container).toMatchSnapshot();
    expect(await axe(container)).toHaveNoViolations();
  });
  describe("join states", () => {
    const cases: {
      joinState: LobbyJoinState;
      button: string | null;
      disabled: boolean;
      message: string | null;
    }[] = [
      {
        joinState: { kind: "can-join", join: () => {} },
        button: "Join call",
        disabled: false,
        message: null,
      },
      {
        joinState: { kind: "can-ask-to-join", askToJoin: () => {} },
        button: "Request to join call",
        disabled: false,
        message: null,
      },
      {
        joinState: {
          kind: "can-ask-to-join",
          askToJoin: () => {},
          error: "request_failed",
        },
        button: "Request to join call",
        disabled: false,
        message: "Something went wrong",
      },
      {
        joinState: { kind: "sending-request" },
        button: "Request to join call",
        disabled: true,
        message: null,
      },
      {
        joinState: { kind: "joining" },
        button: "Joining",
        disabled: true,
        message: null,
      },
      {
        joinState: {
          kind: "can-join",
          join: () => {},
          notice: "request_accepted",
        },
        button: "Join call",
        disabled: false,
        message: "Your request to join was accepted.",
      },
      {
        joinState: { kind: "waiting-for-approval" },
        button: "Request to join sent",
        disabled: true,
        message: "You will receive an invite",
      },
      {
        joinState: { kind: "denied" },
        button: null,
        disabled: false,
        message: "Your request to join was declined.",
      },
      {
        joinState: { kind: "banned" },
        button: null,
        disabled: false,
        message: "You have been banned from the room.",
      },
      {
        joinState: { kind: "not-allowed" },
        button: null,
        disabled: false,
        message: "You need an invite to join this call.",
      },
    ];

    it.each(cases)(
      "renders $joinState.kind",
      async ({ joinState, button, disabled, message }) => {
        const { container, queryByTestId } = renderLobbyView({ joinState });
        const joinButton = queryByTestId("lobby_joinCall");
        if (button === null) {
          expect(joinButton).toBeNull();
        } else {
          expect(joinButton).toHaveTextContent(button);
          // Compound buttons are soft-disabled: they keep focus and expose
          // `aria-disabled` rather than the DOM `disabled` attribute.
          if (disabled) {
            expect(joinButton).toHaveAttribute("aria-disabled", "true");
          } else {
            expect(joinButton).not.toHaveAttribute("aria-disabled", "true");
          }
        }
        const messageBlock = queryByTestId("lobby_joinMessage");
        if (message === null) {
          expect(messageBlock).toBeNull();
        } else {
          expect(messageBlock).toHaveTextContent(message);
        }
        expect(await axe(container)).toHaveNoViolations();
      },
    );

    it("only marks the waiting button as waiting", () => {
      const waiting = renderLobbyView({
        joinState: { kind: "waiting-for-approval" },
      });
      expect(waiting.getByTestId("lobby_joinCall")).toHaveClass(
        lobbyStyles.wait,
      );
      waiting.unmount();
      const canJoin = renderLobbyView();
      expect(canJoin.getByTestId("lobby_joinCall")).not.toHaveClass(
        lobbyStyles.wait,
      );
    });

    it("does nothing while the join is on its way", async () => {
      const { getByTestId } = renderLobbyView({
        joinState: { kind: "joining" },
      });
      const button = getByTestId("lobby_joinCall");
      expect(button).toHaveAttribute("aria-busy", "true");
      await userEvent.click(button);
      expect(button).toHaveAttribute("aria-disabled", "true");
    });

    it("joins when the join button is pressed", async () => {
      const join = vi.fn();
      const { getByTestId } = renderLobbyView({
        joinState: { kind: "can-join", join },
      });
      await userEvent.click(getByTestId("lobby_joinCall"));
      expect(join).toHaveBeenCalled();
    });

    it("asks to join when the request button is pressed", async () => {
      const askToJoin = vi.fn();
      const { getByTestId } = renderLobbyView({
        joinState: { kind: "can-ask-to-join", askToJoin },
      });
      await userEvent.click(getByTestId("lobby_joinCall"));
      expect(askToJoin).toHaveBeenCalled();
    });

    it("does nothing while the request is being sent", async () => {
      const { getByTestId } = renderLobbyView({
        joinState: { kind: "sending-request" },
      });
      const button = getByTestId("lobby_joinCall");
      expect(button).toHaveAttribute("aria-busy", "true");
      await userEvent.click(button);
      expect(button).toHaveAttribute("aria-disabled", "true");
    });

    it("withdraws the request when cancel is pressed", async () => {
      const cancelRequest = vi.fn();
      const { getByTestId } = renderLobbyView({
        joinState: { kind: "waiting-for-approval", cancelRequest },
      });
      await userEvent.click(getByTestId("lobby_cancelRequest"));
      expect(cancelRequest).toHaveBeenCalled();
    });

    it("offers no cancel link when withdrawing is unsupported", () => {
      const { queryByTestId } = renderLobbyView({
        joinState: { kind: "waiting-for-approval" },
      });
      expect(queryByTestId("lobby_cancelRequest")).toBeNull();
    });

    it("shows the ban reason", () => {
      const { getByTestId } = renderLobbyView({
        joinState: { kind: "banned", reason: "Not today" },
      });
      expect(getByTestId("lobby_joinMessage")).toHaveTextContent(
        "Reason: Not today",
      );
    });
  });
});
