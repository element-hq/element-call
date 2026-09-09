/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import EventEmitter from "events";
import {
  EventType,
  JoinRule,
  KnownMembership,
  MatrixEvent,
  RoomEvent,
  SyncState,
  type MatrixClient,
  type Membership,
  type Room,
  type RoomState,
  type RoomSummary,
} from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import { mockMatrixRoom } from "../utils/test";
import { type LobbyJoinState } from "./LobbyJoinState";
import {
  useLoadGroupCall,
  type GroupCallLobby,
  type GroupCallStatus,
} from "./useLoadGroupCall";

const roomId = "!call:example.org";
const userId = "@gwen:example.org";
const viaServers = ["example.org"];

interface RoomSpec {
  membership?: Membership;
  prevMembership?: Membership;
  joinRule?: string;
  reason?: string;
}

/** A room whose membership follows `spec`, so a test can change it. */
function mockRoom(spec: RoomSpec = {}): Room {
  const state = new Map<string, MatrixEvent>([
    [
      EventType.RoomMember,
      new MatrixEvent({
        type: EventType.RoomMember,
        state_key: userId,
        content: {
          membership: spec.membership ?? KnownMembership.Leave,
          reason: spec.reason,
        },
        unsigned:
          spec.prevMembership === undefined
            ? undefined
            : { prev_content: { membership: spec.prevMembership } },
      }),
    ],
  ]);
  if (spec.joinRule !== undefined)
    state.set(
      EventType.RoomJoinRules,
      new MatrixEvent({
        type: EventType.RoomJoinRules,
        state_key: "",
        content: { join_rule: spec.joinRule },
      }),
    );
  return mockMatrixRoom({
    roomId,
    myUserId: userId,
    name: "Weekly sync",
    getCanonicalAlias: () => null,
    getMxcAvatarUrl: () => null,
    getMyMembership: () => spec.membership!,
    currentState: {
      getStateEvents: (type: string) => state.get(type) ?? null,
    } as unknown as RoomState,
  });
}

type TestClient = MatrixClient & { events: EventEmitter };

function mockClient(overrides: Partial<MatrixClient> = {}): TestClient {
  const events = new EventEmitter();
  return {
    events,
    on: events.on.bind(events),
    off: events.off.bind(events),
    emit: events.emit.bind(events),
    listenerCount: events.listenerCount.bind(events),
    getUserId: () => userId,
    getSyncState: () => SyncState.Syncing,
    getRoom: vi.fn().mockReturnValue(null),
    getRoomIdForAlias: vi.fn(),
    getRoomSummary: vi.fn(),
    joinRoom: vi.fn(),
    knockRoom: vi.fn().mockResolvedValue({ room_id: roomId }),
    leave: vi.fn().mockResolvedValue({}),
    waitUntilRoomReadyForGroupCalls: vi.fn().mockResolvedValue(undefined),
    matrixRTC: { getRoomSession: (room: Room) => ({ room }) },
    ...overrides,
  } as unknown as TestClient;
}

const summary = (extra: Record<string, unknown>): RoomSummary =>
  ({
    room_id: roomId,
    name: "Weekly sync",
    world_readable: false,
    guest_can_join: false,
    num_joined_members: 2,
    ...extra,
  }) as RoomSummary;

const renderLoad = (
  client: MatrixClient,
): ReturnType<typeof renderHook<GroupCallStatus, unknown>> =>
  renderHook(() => useLoadGroupCall(client, roomId, viaServers));

const lobby = (state: GroupCallStatus): GroupCallLobby => {
  expect(state.kind).toBe("lobby");
  return state as GroupCallLobby;
};

async function waitForJoinState<K extends LobbyJoinState["kind"]>(
  result: { current: GroupCallStatus },
  kind: K,
): Promise<Extract<LobbyJoinState, { kind: K }>> {
  await waitFor(() => expect(lobby(result.current).joinState.kind).toBe(kind));
  return lobby(result.current).joinState as Extract<
    LobbyJoinState,
    { kind: K }
  >;
}

const emitMembership = (
  client: TestClient,
  room: Room,
  membership: Membership,
  prevMembership?: Membership,
): void =>
  act(() => {
    client.events.emit(
      RoomEvent.MyMembership,
      room,
      membership,
      prevMembership,
    );
  });

describe("useLoadGroupCall in the standalone app", () => {
  it("joins a public room", async () => {
    const room = mockRoom({ membership: KnownMembership.Join });
    const client = mockClient({
      getRoomSummary: vi
        .fn()
        .mockResolvedValue(summary({ join_rule: JoinRule.Public })),
      joinRoom: vi.fn().mockResolvedValue(room),
    });
    const { result } = renderLoad(client);
    await waitFor(() => expect(result.current.kind).toBe("loaded"));
    expect(client.joinRoom).toHaveBeenCalledWith(roomId, { viaServers });
    expect(client.waitUntilRoomReadyForGroupCalls).toHaveBeenCalledWith(roomId);
  });

  it("treats a room with no summary as public", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const room = mockRoom({ membership: KnownMembership.Join });
    const client = mockClient({
      getRoomSummary: vi.fn().mockRejectedValue(new Error("no /summary here")),
      joinRoom: vi.fn().mockResolvedValue(room),
    });
    const { result } = renderLoad(client);
    await waitFor(() => expect(result.current.kind).toBe("loaded"));
    expect(client.joinRoom).toHaveBeenCalledWith(roomId, { viaServers });
    expect(warn).toHaveBeenCalled();
  });

  it("asks to join a knock room, then joins once accepted", async () => {
    const spec: RoomSpec = {};
    const room = mockRoom(spec);
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(room),
      getRoomSummary: vi
        .fn()
        .mockResolvedValue(summary({ join_rule: JoinRule.Knock })),
      joinRoom: vi.fn().mockResolvedValue(room),
    });
    const { result } = renderLoad(client);

    const canAsk = await waitForJoinState(result, "can-ask-to-join");
    expect(canAsk.error).toBeUndefined();
    act(() => canAsk.askToJoin());
    spec.membership = KnownMembership.Knock;
    await waitForJoinState(result, "waiting-for-approval");
    expect(client.knockRoom).toHaveBeenCalledWith(roomId, {
      viaServers,
      reason: undefined,
    });

    spec.membership = KnownMembership.Invite;
    emitMembership(client, room, KnownMembership.Invite, KnownMembership.Knock);
    await waitFor(() =>
      expect(client.joinRoom).toHaveBeenCalledWith(roomId, { viaServers }),
    );
    spec.membership = KnownMembership.Join;
    emitMembership(client, room, KnownMembership.Join, KnownMembership.Invite);
    await waitFor(() => expect(result.current.kind).toBe("loaded"));
    expect(client.waitUntilRoomReadyForGroupCalls).toHaveBeenCalledWith(roomId);
  });

  it("shows a declined request in the lobby", async () => {
    const spec: RoomSpec = { membership: KnownMembership.Knock };
    const room = mockRoom(spec);
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(room),
      getRoomSummary: vi.fn().mockResolvedValue(
        summary({
          join_rule: JoinRule.Knock,
          membership: KnownMembership.Knock,
        }),
      ),
    });
    const { result } = renderLoad(client);
    await waitForJoinState(result, "waiting-for-approval");
    spec.membership = KnownMembership.Leave;
    emitMembership(client, room, KnownMembership.Leave, KnownMembership.Knock);
    await waitForJoinState(result, "denied");
  });

  it("shows a ban in the lobby", async () => {
    const spec: RoomSpec = { membership: KnownMembership.Knock };
    const room = mockRoom(spec);
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(room),
      getRoomSummary: vi.fn().mockResolvedValue(
        summary({
          join_rule: JoinRule.Knock,
          membership: KnownMembership.Knock,
        }),
      ),
    });
    const { result } = renderLoad(client);
    await waitForJoinState(result, "waiting-for-approval");
    emitMembership(
      client,
      mockRoom({ membership: KnownMembership.Ban, reason: "spam" }),
      KnownMembership.Ban,
    );
    expect(await waitForJoinState(result, "banned")).toMatchObject({
      reason: "spam",
    });
  });

  it("shows a ban found before any request in the lobby", async () => {
    const room = mockRoom({ membership: KnownMembership.Ban, reason: "spam" });
    const client = mockClient({ getRoom: vi.fn().mockReturnValue(room) });
    const { result } = renderLoad(client);
    expect(await waitForJoinState(result, "banned")).toMatchObject({
      reason: "spam",
    });
    expect(client.getRoomSummary).not.toHaveBeenCalled();
  });

  it("keeps the user in the lobby when the request fails to send", async () => {
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(mockRoom()),
      getRoomSummary: vi
        .fn()
        .mockResolvedValue(summary({ join_rule: JoinRule.Knock })),
      knockRoom: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const { result } = renderLoad(client);
    const canAsk = await waitForJoinState(result, "can-ask-to-join");
    act(() => canAsk.askToJoin());
    await waitFor(() => expect(client.knockRoom).toHaveBeenCalled());
    expect(await waitForJoinState(result, "can-ask-to-join")).toMatchObject({
      error: "request_failed",
    });
  });

  it("withdraws a request and offers to ask again", async () => {
    const spec: RoomSpec = { membership: KnownMembership.Knock };
    const room = mockRoom(spec);
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(room),
      getRoomSummary: vi.fn().mockResolvedValue(
        summary({
          join_rule: JoinRule.Knock,
          membership: KnownMembership.Knock,
        }),
      ),
    });
    const { result } = renderLoad(client);
    const waiting = await waitForJoinState(result, "waiting-for-approval");
    act(() => waiting.cancelRequest!());
    await waitFor(() => expect(client.leave).toHaveBeenCalledWith(roomId));
    spec.membership = KnownMembership.Leave;
    emitMembership(client, room, KnownMembership.Leave, KnownMembership.Knock);
    expect(await waitForJoinState(result, "can-ask-to-join")).toMatchObject({
      error: undefined,
    });
  });

  it("offers nothing for an invite-only room", async () => {
    const client = mockClient({
      getRoomSummary: vi
        .fn()
        .mockResolvedValue(summary({ join_rule: JoinRule.Invite })),
    });
    const { result } = renderLoad(client);
    await waitForJoinState(result, "not-allowed");
  });
});
