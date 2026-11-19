/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type MatrixClient, type Room } from "matrix-js-sdk";
import { MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import { mockEmitter, mockMatrixRoom, MockRTCSession } from "../src/utils/test";
import { ElementCall } from "./index";

// The call itself is out of scope: what matters is the session it is handed
const callView = vi.hoisted(() => vi.fn());
vi.mock("../src/room/CallView", () => ({
  CallView: (props: { rtcSession: MatrixRTCSession }): string => {
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
let sessions: MockRTCSession[];

// No `matrixRTC`: the host's session manager is not ours to use
function mockClient(knownRoom: Room | null = room): MatrixClient {
  return {
    ...mockEmitter(),
    getRoom: (id: string) => (id === roomId ? knownRoom : null),
  } as unknown as MatrixClient;
}

beforeEach(() => {
  room = mockMatrixRoom({ roomId });
  sessions = [];
  vi.spyOn(MatrixRTCSession, "sessionForSlot").mockImplementation(() => {
    const session = new MockRTCSession(room);
    sessions.push(session);
    return session as unknown as MatrixRTCSession;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  callView.mockClear();
});

test("calls in the room's default slot, with a session of its own", async () => {
  const client = mockClient();
  render(<ElementCall client={client} roomId={roomId} />);

  await screen.findByText("call");
  expect(MatrixRTCSession.sessionForSlot).toHaveBeenCalledExactlyOnceWith(
    client,
    room,
    { application: "m.call", id: "ROOM" },
  );
  expect(callView).toHaveBeenLastCalledWith(
    expect.objectContaining({ rtcSession: sessions[0] }),
  );
});

test("stops its session when unmounted", async () => {
  const { unmount } = render(
    <ElementCall client={mockClient()} roomId={roomId} />,
  );
  await screen.findByText("call");
  expect(sessions[0].stop).not.toHaveBeenCalled();

  unmount();
  expect(sessions[0].stop).toHaveBeenCalledOnce();
});

test("swaps the session for a new one with a new client", async () => {
  const { rerender } = render(
    <ElementCall client={mockClient()} roomId={roomId} />,
  );
  await screen.findByText("call");

  rerender(<ElementCall client={mockClient()} roomId={roomId} />);
  await vi.waitFor(() =>
    expect(callView).toHaveBeenLastCalledWith(
      expect.objectContaining({ rtcSession: sessions[1] }),
    ),
  );
  expect(sessions[0].stop).toHaveBeenCalledOnce();
  expect(sessions[1].stop).not.toHaveBeenCalled();
});

test("shows no call in a room the host's client does not know", () => {
  render(<ElementCall client={mockClient(null)} roomId={roomId} />);
  expect(MatrixRTCSession.sessionForSlot).not.toHaveBeenCalled();
  expect(screen.queryByText("call")).toBeNull();
});
