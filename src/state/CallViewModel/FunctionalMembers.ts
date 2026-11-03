/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type MatrixEvent,
  type Room as MatrixRoom,
  RoomStateEvent,
  UNSTABLE_ELEMENT_FUNCTIONAL_USERS,
} from "matrix-js-sdk";
import { filter, fromEvent, map, type Observable } from "rxjs";
import { type Behavior, type ObservableScope } from "@element-hq/matrixrtc-sdk";

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
