/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type MatrixEvent,
  type RoomMember,
  RoomStateEvent,
  UNSTABLE_ELEMENT_FUNCTIONAL_USERS,
} from "matrix-js-sdk";
import { combineLatest, filter, fromEvent, map, type Observable } from "rxjs";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  KnownMembership,
  type Room as MatrixRoom,
} from "matrix-js-sdk/lib/matrix";
// eslint-disable-next-line rxjs/no-internal

import { type ObservableScope } from "../../ObservableScope";
import {
  calculateDisplayName,
  shouldDisambiguate,
} from "../../../utils/displayname";
import { type Behavior } from "../../Behavior";

export type RoomMemberMap = Map<
  string,
  Pick<RoomMember, "userId" | "getMxcAvatarUrl" | "rawDisplayName">
>;
export function roomToMembersMap(matrixRoom: MatrixRoom): RoomMemberMap {
  const members = matrixRoom
    .getMembersWithMembership(KnownMembership.Join)
    .concat(matrixRoom.getMembersWithMembership(KnownMembership.Invite));
  return members.reduce((acc, member) => {
    acc.set(member.userId, {
      userId: member.userId,
      getMxcAvatarUrl: member.getMxcAvatarUrl.bind(member),
      rawDisplayName: member.rawDisplayName,
    });
    return acc;
  }, new Map());
}

export function createRoomMembers$(
  scope: ObservableScope,
  matrixRoom: MatrixRoom,
): Behavior<RoomMemberMap> {
  return scope.behavior(
    fromEvent(matrixRoom, RoomStateEvent.Members).pipe(
      map(() => roomToMembersMap(matrixRoom)),
    ),
    roomToMembersMap(matrixRoom),
  );
}

/**
 * The user IDs that the room marks as functional members (bots and other
 * service accounts). They are not treated as participants when deciding who
 * to ring or whether the room is a DM.
 */
export function createFunctionalMembers$(
  scope: ObservableScope,
  matrixRoom: MatrixRoom,
): Behavior<Set<string>> {
  return scope.behavior(
    (
      fromEvent(matrixRoom, RoomStateEvent.Events) as Observable<[MatrixEvent]>
    ).pipe(
      filter(([event]) =>
        UNSTABLE_ELEMENT_FUNCTIONAL_USERS.matches(event.getType()),
      ),
      map(() => functionalMembers(matrixRoom)),
    ),
    functionalMembers(matrixRoom),
  );
}

function functionalMembers(matrixRoom: MatrixRoom): Set<string> {
  const serviceMembers: unknown = matrixRoom.currentState
    .getStateEvents(UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name, "")
    ?.getContent().service_members;
  return new Set(
    Array.isArray(serviceMembers)
      ? serviceMembers.filter((id): id is string => typeof id === "string")
      : [],
  );
}

/**
 * The room members that are not functional members.
 */
export function createHumanRoomMembers$(
  scope: ObservableScope,
  roomMembers$: Behavior<RoomMemberMap>,
  functionalMembers$: Behavior<Set<string>>,
): Behavior<RoomMemberMap> {
  return scope.behavior(
    combineLatest([roomMembers$, functionalMembers$]).pipe(
      map(
        ([members, functional]) =>
          new Map([...members].filter(([userId]) => !functional.has(userId))),
      ),
    ),
  );
}

/**
 * Displayname for each member of the call. This will disambiguate
 * any displayname that clashes with another member. Only members
 * joined to the call are considered here.
 *
 * @returns Map<userId, displayname> uses the Matrix user ID as the key.
 */
// don't do this work more times than we need to. This is achieved by converting to a behavior:
export const memberDisplaynames$ = (
  scope: ObservableScope,
  memberships$: Behavior<Pick<CallMembership, "userId">[]>,
  roomMembers$: Behavior<RoomMemberMap>,
): Behavior<Map<string, string>> => {
  const logger = rootLogger.getChild("[MatrixMemberMetadata]");
  // This map tracks userIds that at some point needed disambiguation.
  // This is a memory leak bound to the number of participants.
  // A call application will always increase the memory if there have been more members in a call.
  // Its capped by room member participants.
  const shouldDisambiguateTrackerMap = new Set<string>();
  return scope.behavior(
    combineLatest([
      // Handle call membership changes
      memberships$,
      // Additionally handle display name changes (implicitly reacting to them)
      roomMembers$,
      // TODO: do we need: pauseWhen(this.pretendToBeDisconnected$),
    ]).pipe(
      map(([memberships, roomMembers]) => {
        const displaynameMap = new Map<string, string>();
        // We only consider RTC members for disambiguation as they are the only visible members.
        for (const rtcMember of memberships) {
          const member = roomMembers.get(rtcMember.userId);
          if (!member) {
            logger.error(`Could not find member for user ${rtcMember.userId}`);
            continue;
          }
          const disambiguateComputed = shouldDisambiguate(
            member,
            memberships,
            roomMembers,
          );

          const disambiguate =
            shouldDisambiguateTrackerMap.has(rtcMember.userId) ||
            disambiguateComputed;
          if (disambiguate) shouldDisambiguateTrackerMap.add(rtcMember.userId);
          displaynameMap.set(
            rtcMember.userId,
            calculateDisplayName(member, disambiguate),
          );
        }
        return displaynameMap;
      }),
    ),
  );
};

export const createMatrixMemberMetadata$ = (
  scope: ObservableScope,
  memberships$: Behavior<Pick<CallMembership, "userId">[]>,
  roomMembers$: Behavior<RoomMemberMap>,
): {
  createDisplayNameBehavior$: (
    scope: ObservableScope,
    userId: string,
  ) => Behavior<string | undefined>;
  createAvatarUrlBehavior$: (
    scope: ObservableScope,
    userId: string,
  ) => Behavior<string | undefined>;
  displaynameMap$: Behavior<Map<string, string>>;
  avatarMap$: Behavior<Map<string, string | undefined>>;
} => {
  const displaynameMap$ = memberDisplaynames$(
    scope,
    memberships$,
    roomMembers$,
  );
  const avatarMap$ = scope.behavior(
    roomMembers$.pipe(
      map((roomMembers) =>
        Array.from(roomMembers.keys()).reduce((acc, key) => {
          acc.set(key, roomMembers.get(key)?.getMxcAvatarUrl());
          return acc;
        }, new Map<string, string | undefined>()),
      ),
    ),
  );
  return {
    createDisplayNameBehavior$: (scope: ObservableScope, userId: string) =>
      scope.behavior(
        displaynameMap$.pipe(
          map((displaynameMap) => displaynameMap.get(userId)),
        ),
      ),
    createAvatarUrlBehavior$: (scope: ObservableScope, userId: string) =>
      scope.behavior(
        roomMembers$.pipe(
          map((roomMembers) => roomMembers.get(userId)?.getMxcAvatarUrl()),
        ),
      ),
    // mostly for testing purposes
    displaynameMap$,
    avatarMap$,
  };
};
