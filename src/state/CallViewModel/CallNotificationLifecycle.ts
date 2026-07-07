/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  type IRTCNotificationContent,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
  type RTCCallIntent,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  filter,
  fromEvent,
  map,
  merge,
  NEVER,
  type Observable,
  of,
  pairwise,
  switchMap,
  timer,
  EMPTY,
  race,
  take,
} from "rxjs";
import {
  type EventTimelineSetHandlerMap,
  EventType,
  type Room as MatrixRoom,
  RoomEvent,
} from "matrix-js-sdk";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../Behavior";
import { type Epoch, type ObservableScope } from "../ObservableScope";
import { type RoomMemberMap } from "./remoteMembers/MatrixMemberMetadata";

export type AutoLeaveReason = "allOthersLeft" | "timeout" | "decline";

export interface RingAttempt {
  intent: RTCCallIntent;
  /**
   * The user ID of the recipient being rung.
   */
  recipient: string;
  /**
   * The eventual outcome of the ringing attempt. (Emits a single value.)
   */
  // TODO: Include a callback for attempting ringing again in case of a timeout
  outcome$: Observable<"accept" | "decline" | "timeout">;
}

export type CallNotificationWrapper = {
  event_id: string;
} & IRTCNotificationContent;

export function createSentCallNotification$(
  scope: ObservableScope,
  matrixRTCSession: MatrixRTCSession,
): Behavior<CallNotificationWrapper | null> {
  const sentCallNotification$ = scope.behavior(
    fromEvent(matrixRTCSession, MatrixRTCSessionEvent.DidSendCallNotification),
    null,
  ) as Behavior<CallNotificationWrapper | null>;
  return sentCallNotification$;
}

export function createReceivedDecline$(
  matrixRoom: MatrixRoom,
): Observable<Parameters<EventTimelineSetHandlerMap[RoomEvent.Timeline]>> {
  return (
    fromEvent(matrixRoom, RoomEvent.Timeline) as Observable<
      Parameters<EventTimelineSetHandlerMap[RoomEvent.Timeline]>
    >
  ).pipe(filter(([event]) => event.getType() === EventType.RTCDecline));
}

export interface Props {
  scope: ObservableScope;
  memberships$: Behavior<Epoch<CallMembership[]>>;
  matrixRoomMembers$: Behavior<RoomMemberMap>;
  sentCallNotification$: Observable<CallNotificationWrapper | null>;
  receivedDecline$: Observable<
    Parameters<EventTimelineSetHandlerMap[RoomEvent.Timeline]>
  >;
  options: { waitForCallPickup?: boolean; autoLeaveWhenOthersLeft?: boolean };
  localUser: { deviceId: string; userId: string };
}

export function createCallNotificationLifecycle$({
  scope,
  memberships$,
  matrixRoomMembers$,
  sentCallNotification$,
  receivedDecline$,
  options,
  localUser,
}: Props): {
  /**
   * An observable of attempts to ring the remote participant's devices.
   */
  ringAttempts$: Observable<RingAttempt>;
  /**
   * An observable that emits when the call should be automatically left.
   *  - if options.autoLeaveWhenOthersLeft is set to true it emits when all others left.
   *  - if options.waitForCallPickup is set to true it emits if noone picked up the ring or if the ring got declined.
   *  - if options.autoLeaveWhenOthersLeft && options.waitForCallPickup is false it will never emit.
   */
  autoLeave$: Observable<AutoLeaveReason>;
} {
  const logger = rootLogger.getChild("[CallNotificationLifecycle]");
  let ringAttempts$: Observable<RingAttempt> = NEVER;
  if (options.waitForCallPickup)
    ringAttempts$ = sentCallNotification$.pipe(
      filter(
        (
          notificationEvent: CallNotificationWrapper | null,
        ): notificationEvent is CallNotificationWrapper =>
          // only care about new events (legacy do not have decline pattern)
          notificationEvent?.notification_type === "ring" &&
          notificationEvent.lifetime > 0,
      ),
      switchMap((notificationEvent) => {
        // We assume that there is only one other user in the room when ringing
        // TODO: Respect io.element.functional_members
        const recipient = [...matrixRoomMembers$.value.keys()].find(
          (userId) => userId !== localUser.userId,
        );
        if (recipient === undefined) {
          logger.warn("No recipient for notification event; not ringing.");
          return EMPTY;
        }

        // Ringing times out after lifetime ms have passed
        const timeout$ = timer(notificationEvent.lifetime).pipe(
          map(() => "timeout" as const),
        );
        // Call is accepted when the recipient joins
        const accept$ = memberships$.pipe(
          filter((ms) => ms.value.some((m) => m.userId === recipient)),
          map(() => "accept" as const),
        );
        // Call is declined when we receive a decline event
        const decline$ = receivedDecline$.pipe(
          filter(
            ([event]) =>
              event.getRelation()?.rel_type === "m.reference" &&
              event.getRelation()?.event_id === notificationEvent.event_id &&
              event.getSender() === recipient,
          ),
          map(() => "decline" as const),
        );

        return of({
          intent: notificationEvent["m.call.intent"] ?? "audio",
          recipient,
          outcome$: race(timeout$, accept$, decline$).pipe(
            take(1),
            // Make this observable 'hot' to avoid running multiple timers. This
            // is not actually a resource leak since there will be at most one
            // active ring attempt at any given time.
            // eslint-disable-next-line element-call/no-observablescope-leak
            scope.share,
          ),
        });
      }),
      scope.share,
    );

  const allOthersLeft$ = memberships$.pipe(
    pairwise(),
    filter(
      ([{ value: prev }, { value: current }]) =>
        current.every((m) => m.userId === localUser.userId) &&
        prev.some((m) => m.userId !== localUser.userId),
    ),
    map(() => {}),
  );

  const autoLeave$ = merge(
    options.autoLeaveWhenOthersLeft === true
      ? allOthersLeft$.pipe(map(() => "allOthersLeft" as const))
      : NEVER,
    ringAttempts$.pipe(
      switchMap(({ outcome$ }) =>
        outcome$.pipe(
          filter((outcome) => outcome === "timeout" || outcome === "decline"),
        ),
      ),
    ),
  );

  return { ringAttempts$, autoLeave$ };
}
