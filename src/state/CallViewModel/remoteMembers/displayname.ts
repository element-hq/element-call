/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RoomMember, RoomStateEvent } from "matrix-js-sdk";
import {
  combineLatest,
  fromEvent,
  map,
  type Observable,
  startWith,
} from "rxjs";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { logger } from "matrix-js-sdk/lib/logger";
import { type Room as MatrixRoom } from "matrix-js-sdk/lib/matrix";
// eslint-disable-next-line rxjs/no-internal
import { type NodeStyleEventEmitter } from "rxjs/internal/observable/fromEvent";

import { Epoch, type ObservableScope } from "../../ObservableScope";
import {
  calculateDisplayName,
  shouldDisambiguate,
} from "../../../utils/displayname";
import { type Behavior } from "../../Behavior";

export function createRoomMembers$(
  scope: ObservableScope,
  matrixRoom: MatrixRoom,
): Behavior<Pick<RoomMember, "userId" | "getMxcAvatarUrl">[]> {
  return scope.behavior(
    fromEvent(matrixRoom, RoomStateEvent.Members).pipe(
      map(() => matrixRoom.getMembers()),
    ),
    [],
  );
}
/**
 * Displayname for each member of the call. This will disambiguate
 * any displayname that clashes with another member. Only members
 * joined to the call are considered here.
 *
 * @returns Map<member.id, displayname> uses the rtc member idenitfier as the key.
 */
// don't do this work more times than we need to. This is achieved by converting to a behavior:
export const memberDisplaynames$ = (
  scope: ObservableScope,
  matrixRoom: Pick<MatrixRoom, "getMember"> & NodeStyleEventEmitter,
  // roomMember$: Behavior<Pick<RoomMember, "userId" | "getMxcAvatarUrl">>;
  memberships$: Observable<Epoch<CallMembership[]>>,
): Behavior<Epoch<Map<string, string>>> =>
  scope.behavior(
    combineLatest([
      // Handle call membership changes
      memberships$,
      // Additionally handle display name changes (implicitly reacting to them)
      fromEvent(matrixRoom, RoomStateEvent.Members).pipe(startWith(null)),
      // TODO: do we need: pauseWhen(this.pretendToBeDisconnected$),
    ]).pipe(
      map(([epochMemberships, _displayNames]) => {
        const { epoch, value: memberships } = epochMemberships;
        const displaynameMap = new Map<string, string>();
        const room = matrixRoom;

        // We only consider RTC members for disambiguation as they are the only visible members.
        for (const rtcMember of memberships) {
          // TODO a hard-coded participant ID ? should use rtcMember.membershipID instead?
          const matrixIdentifier = `${rtcMember.userId}:${rtcMember.deviceId}`;
          const { member } = getRoomMemberFromRtcMember(rtcMember, room);
          if (!member) {
            logger.error(
              "Could not find member for participant id:",
              matrixIdentifier,
            );
            continue;
          }
          const disambiguate = shouldDisambiguate(member, memberships, room);
          displaynameMap.set(
            matrixIdentifier,
            calculateDisplayName(member, disambiguate),
          );
        }
        return new Epoch(displaynameMap, epoch);
      }),
    ),
    new Epoch(new Map<string, string>()),
  );

export function getRoomMemberFromRtcMember(
  rtcMember: CallMembership,
  room: Pick<MatrixRoom, "getMember">,
): { id: string; member: RoomMember | undefined } {
  return {
    id: rtcMember.userId + ":" + rtcMember.deviceId,
    member: room.getMember(rtcMember.userId) ?? undefined,
  };
}
