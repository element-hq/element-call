/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";

import type { MatrixClient } from "matrix-js-sdk";
import type { Room as LivekitRoom } from "livekit-client";
import { DeveloperSettingsTab } from "./DeveloperSettingsTab";
import { getSFUConfigWithOpenID } from "../livekit/openIDSFU";
import { customLivekitUrl as customLivekitUrlSetting } from "./settings";
// Mock url params hook to avoid environment-dependent snapshot churn.
vi.mock("../UrlParams", () => ({
  useUrlParams: (): { mocked: boolean; answer: number } => ({
    mocked: true,
    answer: 42,
  }),
}));

// IMPORTANT: mock the same specifier used by DeveloperSettingsTab
vi.mock("../livekit/openIDSFU", () => ({
  getSFUConfigWithOpenID: vi.fn().mockResolvedValue({
    url: "mock-url",
    jwt: "mock-jwt",
  }),
}));

// Provide a minimal mock of a Livekit Room structure used by the component.
function createMockLivekitRoom(
  wsUrl: string,
  serverInfo: object,
  metadata: string,
): { isLocal: boolean; url: string; room: LivekitRoom; livekitAlias: string } {
  const mockRoom = {
    serverInfo,
    metadata,
    engine: { client: { ws: { url: wsUrl } } },
    localParticipant: { identity: "localParticipantIdentity" },
    remoteParticipants: new Map(),
  } as unknown as LivekitRoom;

  return {
    isLocal: true,
    url: wsUrl,
    room: mockRoom,
    livekitAlias: "TestAlias",
  };
}

// Minimal MatrixClient mock with only the methods used by the component.
function createMockMatrixClient(): MatrixClient {
  return {
    doesServerSupportUnstableFeature: vi.fn().mockResolvedValue(true), // ensure stickyEventsSupported eventually becomes true
    getCrypto: (): { getVersion: () => string } | undefined => ({
      getVersion: () => "crypto-1.0.0",
    }),
    getUserId: () => "@alice:example.org",
    getDeviceId: () => "DEVICE123",
  } as unknown as MatrixClient;
}

describe("DeveloperSettingsTab", () => {
  it("renders and matches snapshot", async () => {
    const client = createMockMatrixClient();

    const livekitRooms: {
      room: LivekitRoom;
      url: string;
      isLocal?: boolean;
      livekitAlias: string;
    }[] = [
      createMockLivekitRoom(
        "wss://local-sfu.example.org",
        { region: "local", version: "1.2.3" },
        "local-metadata",
      ),
      {
        isLocal: false,
        livekitAlias: "TestAlias2",
        url: "wss://remote-sfu.example.org",
        room: {
          localParticipant: { identity: "localParticipantIdentity" },
          remoteParticipants: new Map(),
          serverInfo: { region: "remote", version: "4.5.6" },
          metadata: "remote-metadata",
          engine: { client: { ws: { url: "wss://remote-sfu.example.org" } } },
        } as unknown as LivekitRoom,
      },
    ];

    const { container } = render(
      <DeveloperSettingsTab
        client={client}
        roomId={"#room:example.org"}
        livekitRooms={livekitRooms}
        env={{ MY_MOCK_ENV: 10, ENV: "test" } as unknown as ImportMetaEnv}
      />,
    );

    // Wait for the async sticky events feature check to resolve so the final UI
    // (e.g. enabled Matrix_2_0 radio button) appears deterministically.
    await waitFor(() =>
      expect(client.doesServerSupportUnstableFeature).toHaveBeenCalled(),
    );

    expect(container).toMatchSnapshot();
  });
  describe("custom livekit url", () => {
    afterEach(() => {
      customLivekitUrlSetting.setValue(null);
    });
    const client = {
      doesServerSupportUnstableFeature: vi.fn().mockResolvedValue(true),
      getCrypto: () => ({ getVersion: (): string => "x" }),
      getUserId: () => "@u:hs",
      getDeviceId: () => "DEVICE",
    } as unknown as MatrixClient;
    it("will not update custom livekit url without roomId", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            env={{} as unknown as ImportMetaEnv}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);
      await user.type(input, "wss://example.livekit.invalid");

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);
      expect(getSFUConfigWithOpenID).not.toHaveBeenCalled();

      expect(customLivekitUrlSetting.getValue()).toBe(null);
    });
    it("will not update custom livekit url without text in input", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            roomId="#testRoom"
            env={{} as unknown as ImportMetaEnv}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);
      expect(getSFUConfigWithOpenID).not.toHaveBeenCalled();

      expect(customLivekitUrlSetting.getValue()).toBe(null);
    });
    it("will not update custom livekit url when pressing cancel", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            roomId="#testRoom"
            env={{} as unknown as ImportMetaEnv}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);
      await user.type(input, "wss://example.livekit.invalid");

      const cancelButton = screen.getByRole("button", {
        name: "Reset overwrite",
      });
      await user.click(cancelButton);
      expect(getSFUConfigWithOpenID).not.toHaveBeenCalled();

      expect(customLivekitUrlSetting.getValue()).toBe(null);
    });
    it("will update custom livekit url", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            roomId="#testRoom"
            env={{} as unknown as ImportMetaEnv}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);
      await user.type(input, "wss://example.livekit.valid");

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);
      expect(getSFUConfigWithOpenID).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "wss://example.livekit.valid",
        "#testRoom",
        expect.anything(),
      );

      expect(customLivekitUrlSetting.getValue()).toBe(
        "wss://example.livekit.valid",
      );
    });
    it("will show error on invalid url", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            roomId="#testRoom"
            env={{} as unknown as ImportMetaEnv}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);
      await user.type(input, "wss://example.livekit.valid");

      const saveButton = screen.getByRole("button", { name: "Save" });
      (getSFUConfigWithOpenID as Mock).mockImplementation(() => {
        throw new Error("Invalid URL");
      });
      await user.click(saveButton);
      expect(
        screen.getByText("invalid URL (did not update)"),
      ).toBeInTheDocument();
      expect(customLivekitUrlSetting.getValue()).toBe(null);
    });
  });
});
