/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk";
import { EventType } from "matrix-js-sdk/lib/@types/event";
import { type Logger, logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  type MatrixRTCSession as JsSdkRTCSession,
  MatrixRTCSessionManager,
  type SlotDescription,
} from "matrix-js-sdk/lib/matrixrtc";
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
 * Takes the whole `MatrixClient` rather than a slice of it, and finds the
 * MatrixRTC session itself. The js-sdk is the MatrixRTC implementation today;
 * when the rust-rtc crate replaces it, the SDK has to bridge the crate to the
 * js-sdk client, and only the SDK knows what that bridge needs. Holding the
 * client keeps that change inside the SDK.
 */
export function createRTCSlot(
  scope: ObservableScope,
  client: MatrixClient,
  room: Room,
  options: RTCSlotOptions,
): RTCSlot {
  const logger = rootLogger.getChild("[RTCSlot]");
  const userId = client.getUserId();
  const deviceId = client.getDeviceId();
  if (!(userId && deviceId))
    throw new MatrixRTCError("The client has to be logged in");
  const { application = "m.call", id = "ROOM" } = options;

  const jsSdkSession = sessionManager(
    scope,
    client,
    { application, id },
    logger,
  ).getRoomSession(room);
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

  const slot: RTCSlot = {
    roomId: room.roomId,
    application,
    id,
    status$,
    members$,
    participation$: scope.behavior(
      active$.pipe(map((active) => active?.participation ?? null)),
    ),
    join: (participationOptions: RTCParticipationOptions): RTCParticipation => {
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
          room,
          slot,
          jsSdkSession,
          members$,
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
    },
  };
  return slot;
}

function slotStatus(
  session: Pick<JsSdkRTCSession, "getRtcSlot">,
): "open" | "closed" | undefined {
  return session.getRtcSlot()?.status;
}

/**
 * The js-sdk keeps one session manager per slot. The client comes with the
 * manager for the default slot; any other slot gets a manager of its own,
 * which lives as long as the scope.
 */
function sessionManager(
  scope: ObservableScope,
  client: MatrixClient,
  { application, id }: SlotDescription,
  logger: Logger,
): MatrixRTCSessionManager {
  if (application === "m.call" && id === "ROOM") return client.matrixRTC;
  const manager = new MatrixRTCSessionManager(logger, client, {
    application,
    id,
  });
  manager.start();
  scope.onEnd(() => manager.stop());
  return manager;
}
