/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { map } from "rxjs";

import { type Behavior } from "../../Behavior";
import { type ObservableScope } from "../../ObservableScope";
import { observeDriver } from "../../../driver/observe";
import {
  type RoomDriver,
  type RoomMemberProfile,
} from "../../../driver/ElementCallMatrixClientDriver";
import { type RoomMemberMap } from "./MatrixMemberMetadata";

/** The room's roster as the display-name and ringing code reads it. */
export function roomMemberMapOf(profiles: RoomMemberProfile[]): RoomMemberMap {
  return profiles.reduce((acc, profile) => {
    acc.set(profile.userId, {
      userId: profile.userId,
      rawDisplayName: profile.displayName ?? profile.userId,
      getMxcAvatarUrl: () => profile.avatarUrl ?? undefined,
    });
    return acc;
  }, new Map() as RoomMemberMap);
}

/**
 * The room's joined and invited members, from the client driver. Call
 * members' names come from the crate; this is for the people who are in the
 * room but not (yet) in the call, and for disambiguating names.
 */
export function createParticipationRoomMembers$(
  scope: ObservableScope,
  room: RoomDriver,
): Behavior<RoomMemberMap> {
  return scope.behavior(
    observeDriver(
      scope,
      () => room.getRoomMembers(),
      (listener) => room.subscribeRoomMembers(listener),
    ).pipe(map(roomMemberMapOf)),
  );
}
