/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import type { MatrixClient } from "matrix-js-sdk";
import type { Room as LivekitRoom } from "livekit-client";
import { DeveloperSettingsTab } from "./DeveloperSettingsTab";

// Mock url params hook to avoid environment-dependent snapshot churn.
vi.mock("../UrlParams", () => ({
  useUrlParams: (): { mocked: boolean; answer: number } => ({
    mocked: true,
    answer: 42,
  }),
}));

// Provide a minimal mock of a Livekit Room structure used by the component.
function createMockLivekitRoom(
  wsUrl: string,
  serverInfo: object,
  metadata: string,
): { isLocal: boolean; url: string; room: LivekitRoom } {
  const mockRoom = {
    serverInfo,
    metadata,
    engine: { client: { ws: { url: wsUrl } } },
  } as unknown as LivekitRoom;

  return {
    isLocal: true,
    url: wsUrl,
    room: mockRoom,
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
    }[] = [
      createMockLivekitRoom(
        "wss://local-sfu.example.org",
        { region: "local", version: "1.2.3" },
        "local-metadata",
      ),
      {
        isLocal: false,
        url: "wss://remote-sfu.example.org",
        room: {
          serverInfo: { region: "remote", version: "4.5.6" },
          metadata: "remote-metadata",
          engine: { client: { ws: { url: "wss://remote-sfu.example.org" } } },
        } as unknown as LivekitRoom,
      },
    ];

    const { container } = render(
      <DeveloperSettingsTab
        client={client}
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
});
