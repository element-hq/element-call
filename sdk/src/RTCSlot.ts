/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { EventType } from "matrix-js-sdk/lib/@types/event";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  type Statistics,
  MatrixRTCSession as JsMatrixRTCSession,
  MatrixRTCSessionEvent,
  type IRTCNotificationContent,
  type SlotDescription,
} from "matrix-js-sdk/lib/matrixrtc";
import { type MatrixEvent } from "matrix-js-sdk/lib/models/event";
import { RoomStateEvent } from "matrix-js-sdk/lib/models/room-state";
import {
  BehaviorSubject,
  filter,
  fromEvent,
  map,
  type Observable,
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
import {
  type createSdkMatrixBackend,
  type SdkMatrixBackend,
  withEmitter,
} from "./SdkMatrixBackend";

const ROOM_CALL_SLOT: SlotDescription = { application: "m.call", id: "ROOM" };

/**
 * The slot runs on a matrix-js-sdk session of its own, from the SDK's copy of
 * matrix-js-sdk rather than the client's, and stops it when the scope ends.
 */
export function createRTCSlot(
  scope: ObservableScope,
  backend: SdkMatrixBackend,
  options: RTCSlotOptions,
  /**
   * @deprecated A session the caller owns and stops, in place of the slot's
   * own; `options.slotDescription` is then the session's. Only for the
   * standalone app, which still takes its session from its client's session
   * manager.
   */
  externalJsSdkSession?: JsMatrixRTCSession,
): RTCSlot & {
  // STOP GAP: This should be its own external machine. It is call
  // specific and should not live inside the sdk/rtc-slot.
  // We only put it here today, to make sure the rtcSession is fully
  // hidden inside the sdk.
  // Next step. disable sending call notificaitons in the sdk, write a new
  // notification sender in EC directly on client + room.
  sentCallNotification$: Observable<
    {
      event_id: string;
    } & IRTCNotificationContent
  >;
  // STOP GAP: the same as above. Has to live here. but should become a native
  // SDK propery independent of the rtcSession
  statistics: Statistics;
} {
  // STOP GAP: the slot is still written against a client and a room. Both
  // are refactored along with the backend.
  const client = withEmitter(backend, backend.clientEmitter);
  const room = withEmitter(backend, backend.roomEmitter);
  const logger = rootLogger.getChild("[RTCSlot]");
  const userId = client.getUserId();
  const deviceId = client.getDeviceId();
  const roomId = room.roomId;
  if (!(userId && deviceId))
    throw new MatrixRTCError("The client has to be logged in");

  const jsSdkSession =
    externalJsSdkSession ??
    createJsSdkSession(
      scope,
      client,
      room,
      options.slotDescription ?? ROOM_CALL_SLOT,
    );
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

  return {
    ...slot,
    sentCallNotification$: fromEvent(
      jsSdkSession,
      MatrixRTCSessionEvent.DidSendCallNotification,
      (notification: { event_id: string } & IRTCNotificationContent) =>
        notification,
    ),
    statistics: jsSdkSession.statistics,
  };
}

function createJsSdkSession(
  scope: ObservableScope,
  client: Pick<
    MatrixClient,
    keyof Parameters<typeof createSdkMatrixBackend>[0]
  >,
  room: ConstructorParameters<typeof JsMatrixRTCSession>[1],
  slotDescription: SlotDescription,
): JsMatrixRTCSession {
  const session = new JsMatrixRTCSession(
    // The session's type also asks for `cancelPendingEvent`,
    // `_unstable_updateDelayedEvent` and `decryptEventIfNeeded`, which it
    // never calls
    client as ConstructorParameters<typeof JsMatrixRTCSession>[0],
    room,
    slotDescription,
  );
  scope.onEnd(() => void session.stop());
  return session;
}

function slotStatus(
  session: Pick<JsMatrixRTCSession, "getRtcSlot">,
): "open" | "closed" | undefined {
  return session.getRtcSlot()?.status;
}
