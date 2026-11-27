/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  EventTimeline,
  type MatrixEvent,
  type Room as MatrixRoom,
  RoomStateEvent,
  UNSTABLE_ELEMENT_FUNCTIONAL_USERS,
} from "matrix-js-sdk";
import { filter, fromEvent, map } from "rxjs";
import { type Behavior, type ObservableScope } from "@element-hq/matrixrtc-sdk";

/**
 * The user IDs that the room marks as functional members (bots and other
 * service accounts). They should not be treated as participants when deciding who
 * to ring or whether the room is a DM.
 */
export function createFunctionalMembers$(
  scope: ObservableScope,
  matrixRoom: Pick<MatrixRoom, "getLiveTimeline" | "on" | "off">,
): Behavior<Set<string>> {
  return scope.behavior(
    fromEvent(
      matrixRoom,
      RoomStateEvent.Events,
      (event: MatrixEvent) => event,
    ).pipe(
      filter((event) =>
        UNSTABLE_ELEMENT_FUNCTIONAL_USERS.matches(event.getType()),
      ),
      map(() => functionalMembers(matrixRoom)),
    ),
    functionalMembers(matrixRoom),
  );
}

function functionalMembers(
  matrixRoom: Pick<MatrixRoom, "getLiveTimeline">,
): Set<string> {
  const serviceMembers: unknown = matrixRoom
    .getLiveTimeline()
    .getState(EventTimeline.FORWARDS)
    ?.getStateEvents(UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name, "")
    ?.getContent().service_members;
  return new Set(
    Array.isArray(serviceMembers)
      ? serviceMembers.filter((id): id is string => typeof id === "string")
      : [],
  );
}
