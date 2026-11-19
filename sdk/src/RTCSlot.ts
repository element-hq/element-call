/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk";
import { EventType } from "matrix-js-sdk/lib/@types/event";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { type MatrixRTCSession as JsSdkRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { type MatrixEvent } from "matrix-js-sdk/lib/models/event";
import { RoomStateEvent } from "matrix-js-sdk/lib/models/room-state";
import {
  BehaviorSubject,
  filter,
  fromEvent,
  map,
  of,
  startWith,
  switchMap,
} from "rxjs";

import { ObservableScope } from "./reactive/ObservableScope";
import { generateItems } from "./reactive/observable";
import {
  type ParticipationSlot,
  type RTCMember,
  type RTCParticipation,
  type RTCParticipationOptions,
  type RTCSlot,
  type RTCSlotOptions,
} from "./api";
import { MatrixRTCError } from "./errors";
import {
  createRTCParticipation,
  type ParticipationInternals,
} from "./RTCParticipation";
import { createMemberships$ } from "./matrixrtc/JsRtcSessionBehaviors";
import {
  createMatrixMemberMetadata$,
  createRoomMembers$,
} from "./matrixrtc/MatrixMemberMetadata";
import {
  createRTCMember,
  type MemberContext,
  membershipKeys,
} from "./matrixrtc/Members";
import { createTransportRegistry } from "./matrixrtc/Transports";



/**
 * Takes the whole `MatrixClient` rather than a slice of it. The js-sdk is the
 * MatrixRTC implementation today; when the rust-rtc crate replaces it, the SDK
 * has to bridge the crate to the js-sdk client, and only the SDK knows what
 * that bridge needs. Holding the client keeps that change inside the SDK.
 *
 * The session is passed separately: the caller has to pass a session from the
 * same matrix-js-sdk copy as the SDK's. The caller owns its lifetime too, so
 * stops it once done; ending the slot's scope does not.
 */
export function createRTCSlot(
  scope: ObservableScope,
  client: MatrixClient,
  //  The parts of the Matrix room a slot reads. `on` and `off` are only there for
  //  `fromEvent`, which listens on the room for:
  //  - `RoomStateEvent.Events`, to update the slot status;
  //  - `RoomStateEvent.Members`, to update the members' display names and avatars.
  room: Pick<Room, "roomId" | "getMembersWithMembership" | "on" | "off">,
  options: RTCSlotOptions,
  jsSdkSession: JsSdkRTCSession,
): RTCSlot {
  const logger = rootLogger.getChild("[RTCSlot]");
  const userId = client.getUserId();
  const deviceId = client.getDeviceId();
  const roomId = room.roomId;
  if (!(userId && deviceId))
    throw new MatrixRTCError("The client has to be logged in");

  const memberships$ = createMemberships$(scope, jsSdkSession);

  const active$ = new BehaviorSubject<ParticipationInternals | null>(null);
  const participationScopes = new Set<ObservableScope>();
  scope.onEnd(() => {
    for (const participationScope of participationScopes)
      participationScope.end();
  });
  const transports = createTransportRegistry(
    scope,
    scope.behavior(
      active$.pipe(switchMap((active) => active?.connections$ ?? of([]))),
    ),
  );
  const context: MemberContext = {
    metadata: createMatrixMemberMetadata$(
      scope,
      scope.behavior(memberships$.pipe(map(({ value }) => value))),
      createRoomMembers$(scope, room),
    ),
    transports,
    own: { userId, deviceId },
  };

  const members$ = scope.behavior<RTCMember[]>(
    memberships$.pipe(
      map(({ value }) => value),
      generateItems(
        "RTCSlot members",
        function* (memberships) {
          for (const membership of memberships)
            yield { keys: membershipKeys(membership), data: membership };
        },
        (memberScope, membership$) =>
          createRTCMember(memberScope, membership$, context),
      ),
    ),
  );

  // The status is undefined while the room has no slot event, and an explicit
  // undefined is not an initial value to `behavior`, so it goes in the stream
  const status$ = scope.behavior(
    fromEvent(room, RoomStateEvent.Events, (event: MatrixEvent) => event).pipe(
      filter((event) => event.getType() === EventType.RTCSlot),
      map(() => slotStatus(jsSdkSession)),
      startWith(slotStatus(jsSdkSession)),
    ),
  );

  const participationSlot: ParticipationSlot = {
    roomId,
    status$,
    members$,
    ...jsSdkSession.slotDescription,
  };

  const join = (
    participationOptions: RTCParticipationOptions,
  ): RTCParticipation => {
    if (active$.value !== null)
      throw new MatrixRTCError(
        "Already in this slot: leave the participation before joining again",
      );
    const participationScope = new ObservableScope();
    participationScopes.add(participationScope);
    const internals = createRTCParticipation(
      participationScope,
      {
        client,
        slot: participationSlot,
        jsSdkSession,
        transports,
        slotOptions: options,
        logger,
      },
      participationOptions,
    );
    participationScope.onEnd(() => {
      participationScopes.delete(participationScope);
      if (active$.value === internals) active$.next(null);
    });
    active$.next(internals);
    return internals.participation;
  };

  const slot = {
    join,
    participation$: scope.behavior(
      active$.pipe(map((active) => active?.participation ?? null)),
    ),
    ...participationSlot,
  };

  return slot;
}

function slotStatus(
  session: Pick<JsSdkRTCSession, "getRtcSlot">,
): "open" | "closed" | undefined {
  return session.getRtcSlot()?.status;
}
