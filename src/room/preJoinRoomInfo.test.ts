/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import {
  EventType,
  MatrixEvent,
  type Room,
  type RoomState,
  type RoomSummary,
} from "matrix-js-sdk";

import { E2eeType } from "../e2ee/e2eeType";
import { mockMatrixRoom } from "../utils/test";
import {
  preJoinRoomInfoFromRoom,
  preJoinRoomInfoFromSummary,
} from "./preJoinRoomInfo";

const roomId = "!call:example.org";

const summary = (extra: Partial<RoomSummary> = {}): RoomSummary =>
  ({
    room_id: roomId,
    name: "Weekly sync",
    canonical_alias: "#sync:example.org",
    avatar_url: "mxc://example.org/avatar",
    world_readable: false,
    guest_can_join: false,
    num_joined_members: 3,
    ...extra,
  }) as RoomSummary;

const room = (extra: { encryption?: string } = {}): Room =>
  mockMatrixRoom({
    roomId,
    name: "Weekly sync",
    getCanonicalAlias: () => "#sync:example.org",
    getMxcAvatarUrl: () => "mxc://example.org/avatar",
    currentState: {
      getStateEvents: (type: string) =>
        type === EventType.RoomEncryption && extra.encryption !== undefined
          ? new MatrixEvent({
              type: EventType.RoomEncryption,
              state_key: "",
              content: { algorithm: extra.encryption },
            })
          : null,
    } as unknown as RoomState,
  });

describe("preJoinRoomInfoFromSummary", () => {
  it("reads the stable encryption field", () => {
    expect(
      preJoinRoomInfoFromSummary(
        summary({ encryption: "m.megolm.v1.aes-sha2" } as Partial<RoomSummary>),
      ),
    ).toEqual({
      roomId,
      roomName: "Weekly sync",
      roomAlias: "#sync:example.org",
      roomAvatar: "mxc://example.org/avatar",
      e2eeSystem: { kind: E2eeType.PER_PARTICIPANT },
    });
  });

  it("falls back to the unstable encryption field", () => {
    expect(
      preJoinRoomInfoFromSummary(
        summary({ "im.nheko.summary.encryption": "m.megolm.v1.aes-sha2" }),
      ).e2eeSystem,
    ).toEqual({ kind: E2eeType.PER_PARTICIPANT });
  });

  it("is unencrypted when neither field is set", () => {
    expect(preJoinRoomInfoFromSummary(summary()).e2eeSystem).toEqual({
      kind: E2eeType.NONE,
    });
  });
});

describe("preJoinRoomInfoFromRoom", () => {
  it("reads the encryption state event", () => {
    expect(
      preJoinRoomInfoFromRoom(room({ encryption: "m.megolm.v1.aes-sha2" })),
    ).toEqual({
      roomId,
      roomName: "Weekly sync",
      roomAlias: "#sync:example.org",
      roomAvatar: "mxc://example.org/avatar",
      e2eeSystem: { kind: E2eeType.PER_PARTICIPANT },
    });
  });

  it("is unencrypted with no encryption state event", () => {
    expect(preJoinRoomInfoFromRoom(room()).e2eeSystem).toEqual({
      kind: E2eeType.NONE,
    });
  });
});
