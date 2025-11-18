/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
  type MatrixRTCSessionEventHandlerMap,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  combineLatest,
  concat,
  endWith,
  filter,
  fromEvent,
  ignoreElements,
  map,
  merge,
  NEVER,
  type Observable,
  of,
  pairwise,
  startWith,
  switchMap,
  takeUntil,
  timer,
} from "rxjs";
import {
  type EventTimelineSetHandlerMap,
  EventType,
  type Room as MatrixRoom,
  RoomEvent,
} from "matrix-js-sdk";

import { type Behavior } from "../Behavior";
import { type Epoch, mapEpoch, type ObservableScope } from "../ObservableScope";
export type AutoLeaveReason = "allOthersLeft" | "timeout" | "decline";
export type CallPickupState =
  | "unknown"
  | "ringing"
  | "timeout"
  | "decline"
  | "success"
  | null;
export type CallNotificationWrapper = Parameters<
  MatrixRTCSessionEventHandlerMap[MatrixRTCSessionEvent.DidSendCallNotification]
>;
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
  sentCallNotification$: Observable<CallNotificationWrapper | null>;
  receivedDecline$: Observable<
    Parameters<EventTimelineSetHandlerMap[RoomEvent.Timeline]>
  >;
  options: { waitForCallPickup?: boolean; autoLeaveWhenOthersLeft?: boolean };
  localUser: { deviceId: string; userId: string };
}
/**
 * @returns {callPickupState$, autoLeave$}
 * `callPickupState$` The current call pickup state of the call.
 *  - "unknown": The client has not yet sent the notification event. We don't know if it will because it first needs to send its own membership.
 *     Then we can conclude if we were the first one to join or not.
 *     This may also be set if we are disconnected.
 *  - "ringing": The call is ringing on other devices in this room (This client should give audiovisual feedback that this is happening).
 *  - "timeout": No-one picked up in the defined time this call should be ringing on others devices.
 *     The call failed. If desired this can be used as a trigger to exit the call.
 *  - "success": Someone else joined. The call is in a normal state. No audiovisual feedback.
 *  - null: EC is configured to never show any waiting for answer state.
 *
 * `autoLeave$` An observable that emits (null) when the call should be automatically left.
 *  - if options.autoLeaveWhenOthersLeft is set to true it emits when all others left.
 *  - if options.waitForCallPickup is set to true it emits if noone picked up the ring or if the ring got declined.
 *  - if options.autoLeaveWhenOthersLeft && options.waitForCallPickup is false it will never emit.
 *
 */
export function createCallNotificationLifecycle$({
  scope,
  memberships$,
  sentCallNotification$,
  receivedDecline$,
  options,
  localUser,
}: Props): {
  callPickupState$: Behavior<CallPickupState>;
  autoLeave$: Observable<AutoLeaveReason>;
} {
  const allOthersLeft$ = memberships$.pipe(
    pairwise(),
    filter(
      ([{ value: prev }, { value: current }]) =>
        current.every((m) => m.userId === localUser.userId) &&
        prev.some((m) => m.userId !== localUser.userId),
    ),
    map(() => {}),
  );

  /**
   * Whether some Matrix user other than ourself is joined to the call.
   */
  const someoneElseJoined$ = memberships$.pipe(
    mapEpoch((ms) => ms.some((m) => m.userId !== localUser.userId)),
  ) as Behavior<Epoch<boolean>>;

  /**
   * Whenever the RTC session tells us that it intends to ring the remote
   * participant's devices, this emits an Observable tracking the current state of
   * that ringing process.
   */
  // This is a behavior since we need to store the latest state for when we subscribe to this after `didSendCallNotification$`
  // has already emitted but we still need the latest observable with a timeout timer that only gets created on after receiving `notificationEvent`.
  // A behavior will emit the latest observable with the running timer to new subscribers.
  // see also: callPickupState$ and in particular the line: `return this.ring$.pipe(mergeAll());` here we otherwise might get an EMPTY observable if
  // `ring$` would not be a behavior.
  const remoteRingState$: Behavior<"ringing" | "timeout" | "decline" | null> =
    scope.behavior(
      sentCallNotification$.pipe(
        filter(
          (newAndLegacyEvents) =>
            // only care about new events (legacy do not have decline pattern)
            newAndLegacyEvents?.[0].notification_type === "ring",
        ),
        map((e) => e as CallNotificationWrapper),
        switchMap(([notificationEvent]) => {
          const lifetimeMs = notificationEvent?.lifetime ?? 0;
          return concat(
            lifetimeMs === 0
              ? // If no lifetime, skip the ring state
                of(null)
              : // Ring until lifetime ms have passed
                timer(lifetimeMs).pipe(
                  ignoreElements(),
                  startWith("ringing" as const),
                ),
            // The notification lifetime has timed out, meaning ringing has likely
            // stopped on all receiving clients.
            of("timeout" as const),
            // This makes sure we will not drop into the `endWith("decline" as const)` state
            NEVER,
          ).pipe(
            takeUntil(
              receivedDecline$.pipe(
                filter(
                  ([event]) =>
                    event.getRelation()?.rel_type === "m.reference" &&
                    event.getRelation()?.event_id ===
                      notificationEvent.event_id &&
                    event.getSender() !== localUser.userId &&
                    callPickupState$.value !== "timeout",
                ),
              ),
            ),
            endWith("decline" as const),
          );
        }),
      ),
      null,
    );

  const callPickupState$ = scope.behavior(
    options.waitForCallPickup === true
      ? combineLatest(
          [someoneElseJoined$, remoteRingState$],
          (someoneElseJoined, ring) => {
            if (someoneElseJoined.value === true) {
              return "success" as const;
            }
            // Show the ringing state of the most recent ringing attempt.
            // as long as we have not yet sent an RTC notification event or noone else joined,
            // ring will be null -> callPickupState$ = unknown.
            return ring ?? ("unknown" as const);
          },
        )
      : NEVER,
    null,
  );

  const autoLeave$ = merge(
    options.autoLeaveWhenOthersLeft === true
      ? allOthersLeft$.pipe(map(() => "allOthersLeft" as const))
      : NEVER,
    callPickupState$.pipe(
      filter((state) => state === "timeout" || state === "decline"),
    ),
  );
  return { autoLeave$, callPickupState$ };
}
