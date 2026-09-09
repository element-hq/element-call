/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";
import { type MatrixClient } from "matrix-js-sdk";

import { KnockLobbyView } from "./KnockLobbyView";
import { type LobbyJoinState } from "./LobbyJoinState";
import { LeaveToHomeProvider } from "../LeaveToHomeContext";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type ProcessorState } from "../livekit/TrackProcessorContext";
import { mockMediaDevices } from "../utils/test";
import { E2eeType } from "../e2ee/e2eeType";
import { type PreJoinRoomInfo } from "./preJoinRoomInfo";

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

const client = {
  getUserId: () => "@user:example.org",
  getDeviceId: () => "DEVICE",
} as Partial<MatrixClient> as MatrixClient;

// What peeking at a room we are not in tells us about it
const room: PreJoinRoomInfo = {
  roomId: "!room:example.org",
  roomName: "Knock Room",
  roomAlias: null,
  roomAvatar: null,
  e2eeSystem: { kind: E2eeType.PER_PARTICIPANT },
};

function renderKnockLobby(joinState: LobbyJoinState): void {
  render(
    <LeaveToHomeProvider value={vi.fn()}>
      <MediaDevicesContext value={mockMediaDevices({})}>
        <TooltipProvider>
          <KnockLobbyView
            client={client}
            room={room}
            profile={{ displayName: "Test User", avatarUrl: "" }}
            joinState={joinState}
            confineToRoom={false}
            hideHeader={false}
          />
        </TooltipProvider>
      </MediaDevicesContext>
    </LeaveToHomeProvider>,
  );
}

describe("KnockLobbyView", () => {
  it("offers to ask to join, with what it knows of the room", async () => {
    const askToJoin = vi.fn();
    renderKnockLobby({ kind: "can-ask-to-join", askToJoin });

    // The mute state arrives asynchronously, and the lobby with it
    const button = await screen.findByTestId("lobby_joinCall");
    expect(button).toHaveTextContent("Request to join call");
    expect(button).toBeEnabled();
    expect(screen.getByText("Knock Room")).toBeInTheDocument();

    await userEvent.setup().click(button);
    expect(askToJoin).toHaveBeenCalledOnce();
  });

  it("waits once it has asked", async () => {
    renderKnockLobby({ kind: "waiting-for-approval" });

    const button = await screen.findByTestId("lobby_joinCall");
    expect(button).toHaveTextContent("Request to join sent");
    // Compound's button keeps focusable, saying so through ARIA instead
    expect(button).toHaveAttribute("aria-disabled", "true");
  });
});
