/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi, type Mock } from "vitest";
import { type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import EventEmitter from "events";
import {
  ClientEvent,
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
import {
  type HostBridge,
  HostBridgeProvider,
  nullHostBridge,
} from "../HostBridge";
import { getUrlParams, UrlParamsProvider } from "../UrlParams";
import { MembershipUnsupportedError } from "./membership";
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

/**
 * Renders the hook, as a widget of `host` when one is given.
 */
const renderLoad = (
  client: MatrixClient,
  host?: HostBridge,
): ReturnType<typeof renderHook<GroupCallStatus, unknown>> =>
  renderHook(() => useLoadGroupCall(client, roomId, viaServers), {
    wrapper: ({ children }): ReactNode =>
      host === undefined ? (
        children
      ) : (
        <UrlParamsProvider value={{ ...getUrlParams(), isWidget: true }}>
          <HostBridgeProvider value={host}>{children}</HostBridgeProvider>
        </UrlParamsProvider>
      ),
  });

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

describe("useLoadGroupCall as a widget", () => {
  /** A host that answers membership changes with `changeMembership`. */
  const host = (
    changeMembership: Mock = vi.fn().mockResolvedValue(KnownMembership.Knock),
  ): HostBridge => ({ ...nullHostBridge, changeMembership });

  it("proceeds straight to the call when the host has joined us", async () => {
    const room = mockRoom({ membership: KnownMembership.Join });
    const client = mockClient({ getRoom: vi.fn().mockReturnValue(room) });
    const { result } = renderLoad(client, host());
    await waitFor(() => expect(result.current.kind).toBe("loaded"));
  });

  it.each([
    ["a ban", { membership: KnownMembership.Ban }, "banned"],
    [
      "a pending request",
      { membership: KnownMembership.Knock },
      "waiting-for-approval",
    ],
    [
      "an invite that replaced a request",
      {
        membership: KnownMembership.Invite,
        prevMembership: KnownMembership.Knock,
      },
      "waiting-for-approval",
    ],
    ["a plain invite", { membership: KnownMembership.Invite }, "can-join"],
    [
      "a declined request",
      {
        membership: KnownMembership.Leave,
        prevMembership: KnownMembership.Knock,
      },
      "denied",
    ],
    [
      "a public room",
      { membership: KnownMembership.Leave, joinRule: JoinRule.Public },
      "can-join",
    ],
    [
      "a restricted room",
      { membership: KnownMembership.Leave, joinRule: JoinRule.Restricted },
      "can-join",
    ],
    [
      "a knock_restricted room",
      { membership: KnownMembership.Leave, joinRule: "knock_restricted" },
      "can-join",
    ],
    [
      "a knock room",
      { membership: KnownMembership.Leave, joinRule: JoinRule.Knock },
      "can-ask-to-join",
    ],
    [
      "a knock room with no membership",
      { joinRule: JoinRule.Knock },
      "can-ask-to-join",
    ],
    [
      "an invite-only room",
      { membership: KnownMembership.Leave, joinRule: JoinRule.Invite },
      "not-allowed",
    ],
    [
      "a room with no join rule",
      { membership: KnownMembership.Leave },
      "not-allowed",
    ],
  ])("opens the lobby of %s", async (_case, spec, expected) => {
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(mockRoom(spec)),
    });
    const { result } = renderLoad(client, host());
    await waitForJoinState(result, expected as LobbyJoinState["kind"]);
  });

  it("warns when the host has not shared the join rule", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const client = mockClient({
      getRoom: vi
        .fn()
        .mockReturnValue(mockRoom({ membership: KnownMembership.Leave })),
    });
    const { result } = renderLoad(client, host());
    await waitForJoinState(result, "not-allowed");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("m.room.join_rules"),
    );
  });

  it("waits for approval when the host knocked instead of joining", async () => {
    const changeMembership = vi.fn().mockResolvedValue(KnownMembership.Knock);
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(
        mockRoom({
          membership: KnownMembership.Leave,
          joinRule: "knock_restricted",
        }),
      ),
    });
    const { result } = renderLoad(client, host(changeMembership));
    const canJoin = await waitForJoinState(result, "can-join");
    act(() => canJoin.join());
    await waitForJoinState(result, "waiting-for-approval");
    expect(changeMembership).toHaveBeenCalledWith({ action: "join" });
  });

  it("returns to the lobby when the host does not answer", async () => {
    const changeMembership = vi
      .fn()
      .mockRejectedValue(new Error("Request timed out"));
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(
        mockRoom({
          membership: KnownMembership.Leave,
          joinRule: JoinRule.Knock,
        }),
      ),
    });
    const { result } = renderLoad(client, host(changeMembership));
    const canAsk = await waitForJoinState(result, "can-ask-to-join");
    act(() => canAsk.askToJoin("let me in"));
    expect(await waitForJoinState(result, "can-ask-to-join")).toMatchObject({
      error: "request_failed",
    });
    expect(changeMembership).toHaveBeenCalledWith({
      action: "knock",
      reason: "let me in",
    });
  });

  it("gives up when the host has no membership action", async () => {
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(
        mockRoom({
          membership: KnownMembership.Leave,
          joinRule: JoinRule.Knock,
        }),
      ),
    });
    const { result } = renderLoad(
      client,
      host(vi.fn().mockRejectedValue(new MembershipUnsupportedError())),
    );
    const canAsk = await waitForJoinState(result, "can-ask-to-join");
    act(() => canAsk.askToJoin());
    await waitForJoinState(result, "not-allowed");
  });

  it("resolves when the host joined us before we could listen", async () => {
    const room = mockRoom({ membership: KnownMembership.Knock });
    (room as { getMyMembership: () => Membership }).getMyMembership = vi
      .fn()
      .mockReturnValueOnce(KnownMembership.Knock)
      .mockReturnValue(KnownMembership.Join);
    const client = mockClient({ getRoom: vi.fn().mockReturnValue(room) });
    const { result } = renderLoad(client, host());
    await waitFor(() => expect(result.current.kind).toBe("loaded"));
  });

  it("adds no listener as the join state changes, and removes them all on unmount", async () => {
    const client = mockClient({
      getRoom: vi.fn().mockReturnValue(
        mockRoom({
          membership: KnownMembership.Leave,
          joinRule: JoinRule.Knock,
        }),
      ),
    });
    const { result, unmount } = renderLoad(client, host());
    const canAsk = await waitForJoinState(result, "can-ask-to-join");
    const listeners = client.listenerCount(RoomEvent.MyMembership);
    act(() => canAsk.askToJoin());
    await waitForJoinState(result, "waiting-for-approval");
    expect(client.listenerCount(RoomEvent.MyMembership)).toBe(listeners);
    unmount();
    expect(client.listenerCount(RoomEvent.MyMembership)).toBe(0);
    expect(client.listenerCount(ClientEvent.Sync)).toBe(0);
  });
});
