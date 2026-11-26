/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type MatrixClient, type Room } from "matrix-js-sdk";

import { mockEmitter, mockMatrixRoom } from "../src/utils/test";
import { ElementCall } from "./index";

// The call itself is out of scope: what matters is what it is handed
const callView = vi.hoisted(() => vi.fn());
vi.mock("../src/room/CallView", () => ({
  CallView: (props: object): string => {
    callView(props);
    return "call";
  },
}));

// Media devices need a browser jsdom does not have
vi.mock("../src/state/AppViewModel", () => ({
  AppViewModel: class {
    public mediaDevices = {};
    public backgroundEffects = {};
  },
}));

const roomId = "!room:example.org";
let room: Room;

beforeEach(() => {
  // What the call's backend takes from the room
  room = mockMatrixRoom({
    roomId,
    getMembersWithMembership: vi.fn(),
    getLiveTimeline: vi.fn(),
    getVersion: vi.fn(),
    hasMembershipState: vi.fn(),
    _unstable_getStickyEvents: vi.fn(),
    getMxcAvatarUrl: vi.fn(),
    getJoinRule: vi.fn(),
  });
});

afterEach(() => {
  callView.mockClear();
});

test("calls in the room, leaving the session to the call", async () => {
  render(<ElementCall client={mockClient()} room={room} />);

  await screen.findByText("call");
  const props = callView.mock.lastCall?.[0];
  expect(props).toMatchObject({ backend: { roomId } });
  expect(props).not.toHaveProperty("rtcSession");
});

// No `matrixRTC`: the host's session manager is not ours to use
function mockClient(): MatrixClient {
  return {
    ...mockEmitter(),
    // What the call view's client is made from
    baseUrl: "https://matrix.example.org",
    getUserId: () => "@alice:example.org",
    getDeviceId: () => "DEVICE",
    getAccessToken: () => "token",
    getSyncState: () => null,
    getUser: () => null,
    getCrypto: () => undefined,
    sendEvent: vi.fn(),
    sendStateEvent: vi.fn(),
    _unstable_sendStickyEvent: vi.fn(),
    _unstable_sendStickyDelayedEvent: vi.fn(),
    cancelPendingEvent: vi.fn(),
    encryptAndSendToDevice: vi.fn(),
    redactEvent: vi.fn(),
    decryptEventIfNeeded: vi.fn(),
    setDisplayName: vi.fn(),
    setAvatarUrl: vi.fn(),
    uploadContent: vi.fn(),
    doesServerSupportUnstableFeature: vi.fn(),
  } as unknown as MatrixClient;
}
