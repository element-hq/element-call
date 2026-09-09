/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventType, type Room, type RoomSummary } from "matrix-js-sdk";

import { E2eeType } from "../e2ee/e2eeType";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";

/**
 * The subset of MatrixInfo that is knowable before the room is joined, from
 * either a room summary or the room state a widget host pushes.
 */
export interface PreJoinRoomInfo {
  roomId: string;
  roomName: string;
  roomAlias: string | null;
  roomAvatar: string | null;
  e2eeSystem: EncryptionSystem;
}

// `RoomSummary` in the js-sdk omits `canonical_alias` and has no stable
// `encryption` field.
type WidenedRoomSummary = RoomSummary & {
  canonical_alias?: string;
  encryption?: string;
};

const e2eeSystem = (encryption: string | undefined): EncryptionSystem =>
  encryption === undefined
    ? { kind: E2eeType.NONE }
    : { kind: E2eeType.PER_PARTICIPANT };

export function preJoinRoomInfoFromSummary(
  summary: RoomSummary,
): PreJoinRoomInfo {
  const widened = summary as WidenedRoomSummary;
  return {
    roomId: summary.room_id,
    roomName: summary.name ?? "",
    roomAlias: widened.canonical_alias ?? null,
    roomAvatar: summary.avatar_url ?? null,
    e2eeSystem: e2eeSystem(
      widened.encryption ?? summary["im.nheko.summary.encryption"],
    ),
  };
}

export function preJoinRoomInfoFromRoom(room: Room): PreJoinRoomInfo {
  return {
    roomId: room.roomId,
    roomName: room.name,
    roomAlias: room.getCanonicalAlias(),
    roomAvatar: room.getMxcAvatarUrl(),
    e2eeSystem: e2eeSystem(
      room.currentState
        .getStateEvents(EventType.RoomEncryption, "")
        ?.getContent().algorithm,
    ),
  };
}
