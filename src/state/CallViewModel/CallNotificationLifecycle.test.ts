/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import EventEmitter from "events";
import { expect, test } from "vitest";
import {
  EventType,
  MatrixEvent,
  type Room,
  RoomEvent,
  RoomStickyEventsEvent,
} from "matrix-js-sdk";
import { type RTCCallIntent } from "matrix-js-sdk/lib/matrixrtc";
import { map, mergeMap, NEVER, type Observable, startWith } from "rxjs";

import { withTestScheduler } from "../../utils/test";
import {
  alice,
  aliceRtcMember,
  local,
  localRtcMember,
} from "../../utils/test-fixtures";
import {
  type CallNotificationWrapper,
  createCallNotificationLifecycle$,
  createReceivedDecline$,
  type RingAttempt,
} from "./CallNotificationLifecycle";
import { constant } from "../Behavior";

function mockRingEvent(
  eventId: string,
  lifetimeMs: number | undefined,
  sender = local.userId,
): CallNotificationWrapper {
  return {
    event_id: eventId,
    ...(lifetimeMs === undefined ? {} : { lifetime: lifetimeMs }),
    notification_type: "ring",
    sender,
  } as unknown as CallNotificationWrapper;
}

const defaultProps = {
  memberUserIds$: constant<string[]>([]),
  roomMemberUserIds$: constant([alice.userId]),
  receivedDecline$: NEVER,
  options: {
    waitForCallPickup: true,
    autoLeaveWhenOthersLeft: false,
  },
  localUser: localRtcMember,
};

function summarizeRingAttempts$(
  ringAttempts$: Observable<RingAttempt>,
): Observable<
  | { intent: RTCCallIntent; recipient: string }
  | { outcome: "accept" | "decline" | "timeout" }
> {
  return ringAttempts$.pipe(
    mergeMap(({ intent, recipient, outcome$ }) =>
      outcome$.pipe(
        map((outcome) => ({ outcome })),
        startWith({ intent, recipient }),
      ),
    ),
  );
}

test("no ring attempt when waitForCallPickup=false", () => {
  withTestScheduler(({ scope, expectObservable, hot }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      sentCallNotification$: hot("-a", {
        a: mockRingEvent("$notif1", 30),
      }),
      options: { ...defaultProps.options, waitForCallPickup: false },
    });

    expectObservable(ringAttempts$).toBe("");
  });
});

test("no ring attempt when notification type is not ring", () => {
  withTestScheduler(({ scope, expectObservable, hot }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      sentCallNotification$: hot("-a", {
        a: {
          ...mockRingEvent("$notif1", 30),
          notification_type: "notification",
        },
      }),
    });

    expectObservable(ringAttempts$).toBe("");
  });
});

test("no ring attempt if lifetime is missing", () => {
  withTestScheduler(({ scope, expectObservable, hot }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      sentCallNotification$: hot("-a", {
        a: mockRingEvent("$notif1", undefined),
      }),
    });

    expectObservable(ringAttempts$).toBe("");
  });
});

test("ring attempt times out after nobody joins", () => {
  withTestScheduler(({ scope, expectObservable, hot }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      // No one ever joins (only local user)
      memberUserIds$: constant<string[]>([]),
      sentCallNotification$: hot("-a", {
        a: mockRingEvent("$notif1", 30),
      }),
    });

    expectObservable(summarizeRingAttempts$(ringAttempts$)).toBe("-a 29ms A", {
      a: { intent: "audio", recipient: alice.userId },
      A: { outcome: "timeout" },
    });
  });
});

test("ring attempt is accepted once recipient joins", () => {
  withTestScheduler(({ scope, expectObservable, hot, behavior }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      memberUserIds$: scope.behavior(
        behavior("a-b", { a: [], b: [aliceRtcMember.userId] }),
      ),
      sentCallNotification$: hot("-a", {
        a: mockRingEvent("$notif1", 30),
      }),
    });

    expectObservable(summarizeRingAttempts$(ringAttempts$)).toBe("-aA", {
      a: { intent: "audio", recipient: alice.userId },
      A: { outcome: "accept" },
    });
  });
});

test("ring attempt is immediately accepted if recipient is already joined", () => {
  withTestScheduler(({ scope, expectObservable, hot }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      memberUserIds$: constant([aliceRtcMember.userId]),
      sentCallNotification$: hot("-a", {
        a: mockRingEvent("$notif1", 30),
      }),
    });

    expectObservable(summarizeRingAttempts$(ringAttempts$)).toBe("-(aA)", {
      a: { intent: "audio", recipient: alice.userId },
      A: { outcome: "accept" },
    });
  });
});

test("ring attempt can be declined", () => {
  withTestScheduler(({ scope, expectObservable, hot }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      sentCallNotification$: hot("-a", {
        a: mockRingEvent("$notif1", 30),
      }),
      receivedDecline$: hot("--d", {
        d: new MatrixEvent({
          type: EventType.RTCDecline,
          sender: alice.userId,
          content: {
            "m.relates_to": {
              rel_type: "m.reference",
              event_id: "$notif1",
            },
          },
        }),
      }),
    });

    expectObservable(summarizeRingAttempts$(ringAttempts$)).toBe("-aA", {
      a: { intent: "audio", recipient: alice.userId },
      A: { outcome: "decline" },
    });
  });
});

test("ring attempt times out if recipient declines too late", () => {
  withTestScheduler(({ scope, expectObservable, hot }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      sentCallNotification$: hot("-a", {
        a: mockRingEvent("$notif1", 30),
      }),
      receivedDecline$: hot("100ms d", {
        d: new MatrixEvent({
          type: EventType.RTCDecline,
          sender: alice.userId,
          content: {
            "m.relates_to": {
              rel_type: "m.reference",
              event_id: "$notif1",
            },
          },
        }),
      }),
    });

    expectObservable(summarizeRingAttempts$(ringAttempts$)).toBe("-a 29ms A", {
      a: { intent: "audio", recipient: alice.userId },
      A: { outcome: "timeout" },
    });
  });
});

test("decline event relating to wrong event is ignored (times out)", () => {
  withTestScheduler(({ scope, expectObservable, hot }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      sentCallNotification$: hot("-a", {
        a: mockRingEvent("$notif1", 30),
      }),
      receivedDecline$: hot("--d", {
        d: new MatrixEvent({
          type: EventType.RTCDecline,
          sender: alice.userId,
          content: {
            "m.relates_to": {
              rel_type: "m.reference",
              event_id: "$other", // <---- WRONG
            },
          },
        }),
      }),
    });

    expectObservable(summarizeRingAttempts$(ringAttempts$)).toBe("-a 29ms A", {
      a: { intent: "audio", recipient: alice.userId },
      A: { outcome: "timeout" },
    });
  });
});

test("decline event from wrong sender is ignored (times out)", () => {
  withTestScheduler(({ scope, expectObservable, hot }) => {
    const { ringAttempts$ } = createCallNotificationLifecycle$({
      scope,
      ...defaultProps,
      sentCallNotification$: hot("-a", {
        a: mockRingEvent("$notif1", 30),
      }),
      receivedDecline$: hot("--d", {
        d: new MatrixEvent({
          type: EventType.RTCDecline,
          sender: local.userId, // <---- WRONG
          content: {
            "m.relates_to": {
              rel_type: "m.reference",
              event_id: "$notif1",
            },
          },
        }),
      }),
    });

    expectObservable(summarizeRingAttempts$(ringAttempts$)).toBe("-a 29ms A", {
      a: { intent: "audio", recipient: alice.userId },
      A: { outcome: "timeout" },
    });
  });
});

test("declines are received from the timeline and the sticky section", () => {
  const room = new EventEmitter();
  const received: string[] = [];
  const subscription = createReceivedDecline$(
    room as unknown as Room,
  ).subscribe((event) => received.push(event.getId()!));
  const event = (eventId: string, type = EventType.RTCDecline): MatrixEvent =>
    new MatrixEvent({ event_id: eventId, type, sender: alice.userId });

  const timelineArgs = [room, false, false, {}];
  room.emit(RoomEvent.Timeline, event("$timeline"), ...timelineArgs);
  room.emit(
    RoomEvent.Timeline,
    event("$message", EventType.RoomMessage),
    ...timelineArgs,
  );
  // A gappy sync delivers the decline only in the sticky section
  room.emit(RoomStickyEventsEvent.Update, [event("$sticky")], [], []);
  room.emit(
    RoomStickyEventsEvent.Update,
    [],
    [{ previous: event("$old"), current: event("$replacement") }],
    [event("$removed")],
  );
  subscription.unsubscribe();

  expect(received).toEqual(["$timeline", "$sticky", "$replacement"]);
});
