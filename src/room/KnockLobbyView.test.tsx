/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";
import { type MatrixClient, type RoomSummary } from "matrix-js-sdk";

import { KnockLobbyView } from "./KnockLobbyView";
import { LeaveToHomeProvider } from "../LeaveToHomeContext";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type ProcessorState } from "../livekit/TrackProcessorContext";
import { mockMediaDevices } from "../utils/test";

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
const roomSummary = {
  room_id: "!room:example.org",
  name: "Knock Room",
  "im.nheko.summary.encryption": "m.megolm.v1.aes-sha2",
} as Partial<RoomSummary> as RoomSummary;

function renderKnockLobby(knock: (() => void) | null): void {
  render(
    <LeaveToHomeProvider value={vi.fn()}>
      <MediaDevicesContext value={mockMediaDevices({})}>
        <TooltipProvider>
          <KnockLobbyView
            client={client}
            roomSummary={roomSummary}
            profile={{ displayName: "Test User", avatarUrl: "" }}
            knock={knock}
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
    const knock = vi.fn();
    renderKnockLobby(knock);

    // The mute state arrives asynchronously, and the lobby with it
    const button = await screen.findByTestId("lobby_joinCall");
    expect(button).toHaveTextContent("Request to join call");
    expect(button).toBeEnabled();
    expect(screen.getByText("Knock Room")).toBeInTheDocument();

    await userEvent.setup().click(button);
    expect(knock).toHaveBeenCalledOnce();
  });

  it("waits once it has asked", async () => {
    renderKnockLobby(null);

    const button = await screen.findByTestId("lobby_joinCall");
    expect(button).toHaveTextContent("Request sent!");
    // Compound's button keeps focusable, saying so through ARIA instead
    expect(button).toHaveAttribute("aria-disabled", "true");
  });
});
