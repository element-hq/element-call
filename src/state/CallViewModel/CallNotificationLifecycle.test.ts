/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ICallNotifyContent,
  type IRTCNotificationContent,
} from "matrix-js-sdk/lib/matrixrtc";
import { describe, it } from "vitest";
import {
  EventType,
  type IEvent,
  type IRoomTimelineData,
  MatrixEvent,
  type Room,
} from "matrix-js-sdk";

import { withTestScheduler } from "../../utils/test";
import {
  aliceRtcMember,
  local,
  localRtcMember,
} from "../../utils/test-fixtures";
import {
  createCallNotificationLifecycle$,
  type Props as CallNotificationLifecycleProps,
} from "./CallNotificationLifecycle";
import { trackEpoch } from "../ObservableScope";

const mockLegacyRingEvent = {} as { event_id: string } & ICallNotifyContent;
function mockRingEvent(
  eventId: string,
  lifetimeMs: number | undefined,
  sender = local.userId,
): { event_id: string } & IRTCNotificationContent {
  return {
    event_id: eventId,
    ...(lifetimeMs === undefined ? {} : { lifetime: lifetimeMs }),
    notification_type: "ring",
    sender,
  } as unknown as { event_id: string } & IRTCNotificationContent;
}

describe("waitForCallPickup$", () => {
  it("unknown -> ringing -> timeout when notified and nobody joins", () => {
    withTestScheduler(({ scope, expectObservable, behavior, hot }) => {
      // No one ever joins (only local user)
      const props: CallNotificationLifecycleProps = {
        scope,
        memberships$: scope.behavior(
          behavior("a", { a: [] }).pipe(trackEpoch()),
        ),
        sentCallNotification$: hot("10ms a", {
          a: [mockRingEvent("$notif1", 30), mockLegacyRingEvent],
        }),
        receivedDecline$: hot(""),
        options: {
          waitForCallPickup: true,
          autoLeaveWhenOthersLeft: false,
        },
        localUser: localRtcMember,
      };

      const lifecycle = createCallNotificationLifecycle$(props);

      expectObservable(lifecycle.callPickupState$).toBe("a 9ms b 29ms c", {
        a: "unknown",
        b: "ringing",
        c: "timeout",
      });
    });
  });

  it("ringing -> success if someone joins before timeout is reached", () => {
    withTestScheduler(({ scope, hot, behavior, expectObservable }) => {
      // Someone joins at 20ms (both LiveKit participant and MatrixRTC member)
      const props: CallNotificationLifecycleProps = {
        scope,
        memberships$: scope.behavior(
          behavior("a 19ms b", {
            a: [localRtcMember],
            b: [localRtcMember, aliceRtcMember],
          }).pipe(trackEpoch()),
        ),
        sentCallNotification$: hot("5ms a", {
          a: [mockRingEvent("$notif2", 100), mockLegacyRingEvent],
        }),
        receivedDecline$: hot(""),
        options: {
          waitForCallPickup: true,
          autoLeaveWhenOthersLeft: false,
        },
        localUser: localRtcMember,
      };
      const lifecycle = createCallNotificationLifecycle$(props);
      expectObservable(lifecycle.callPickupState$).toBe("a 4ms b 14ms c", {
        a: "unknown",
        b: "ringing",
        c: "success",
      });
    });
  });
  it("success when someone joins before we notify", () => {
    withTestScheduler(({ scope, hot, behavior, expectObservable }) => {
      // Someone joins at 20ms (both LiveKit participant and MatrixRTC member)
      const props: CallNotificationLifecycleProps = {
        scope,
        memberships$: scope.behavior(
          behavior("a 9ms b", {
            a: [localRtcMember],
            b: [localRtcMember, aliceRtcMember],
          }).pipe(trackEpoch()),
        ),
        sentCallNotification$: hot("20ms a", {
          a: [mockRingEvent("$notif2", 50), mockLegacyRingEvent],
        }),
        receivedDecline$: hot(""),
        options: {
          waitForCallPickup: true,
          autoLeaveWhenOthersLeft: false,
        },
        localUser: localRtcMember,
      };
      const lifecycle = createCallNotificationLifecycle$(props);
      expectObservable(lifecycle.callPickupState$).toBe("a 9ms b", {
        a: "unknown",
        b: "success",
      });
    });
  });
  it("notify without lifetime -> immediate timeout", () => {
    withTestScheduler(({ scope, hot, behavior, expectObservable }) => {
      // Someone joins at 20ms (both LiveKit participant and MatrixRTC member)
      const props: CallNotificationLifecycleProps = {
        scope,
        memberships$: scope.behavior(
          behavior("a", {
            a: [localRtcMember],
          }).pipe(trackEpoch()),
        ),
        sentCallNotification$: hot("10ms a", {
          a: [mockRingEvent("$notif2", undefined), mockLegacyRingEvent],
        }),
        receivedDecline$: hot(""),
        options: {
          waitForCallPickup: true,
          autoLeaveWhenOthersLeft: false,
        },
        localUser: localRtcMember,
      };
      const lifecycle = createCallNotificationLifecycle$(props);
      expectObservable(lifecycle.callPickupState$).toBe("a 9ms b", {
        a: "unknown",
        b: "timeout",
      });
    });
  });

  it("stays null when waitForCallPickup=false", () => {
    withTestScheduler(({ scope, hot, behavior, expectObservable }) => {
      // Someone joins at 20ms (both LiveKit participant and MatrixRTC member)
      const validProps: CallNotificationLifecycleProps = {
        scope,
        memberships$: scope.behavior(
          behavior("a--b", {
            a: [localRtcMember],
            b: [localRtcMember, aliceRtcMember],
          }).pipe(trackEpoch()),
        ),
        sentCallNotification$: hot("10ms a", {
          a: [mockRingEvent("$notif5", 30), mockLegacyRingEvent],
        }),
        receivedDecline$: hot(""),
        options: {
          waitForCallPickup: true,
          autoLeaveWhenOthersLeft: false,
        },
        localUser: localRtcMember,
      };
      const propsDeactivated = {
        ...validProps,
        options: {
          ...validProps.options,
          waitForCallPickup: false,
        },
      };
      const lifecycle = createCallNotificationLifecycle$(propsDeactivated);
      expectObservable(lifecycle.callPickupState$).toBe("n", {
        n: null,
      });
      const lifecycleReference = createCallNotificationLifecycle$(validProps);
      expectObservable(lifecycleReference.callPickupState$).toBe("u--s", {
        u: "unknown",
        s: "success",
      });
    });
  });

  it("decline before timeout window ends -> decline", () => {
    withTestScheduler(({ scope, hot, behavior, expectObservable }) => {
      // Someone joins at 20ms (both LiveKit participant and MatrixRTC member)
      const props: CallNotificationLifecycleProps = {
        scope,
        memberships$: scope.behavior(
          behavior("a", {
            a: [localRtcMember],
          }).pipe(trackEpoch()),
        ),
        sentCallNotification$: hot("10ms a", {
          a: [mockRingEvent("$decl1", 50), mockLegacyRingEvent],
        }),
        receivedDecline$: hot("40ms d", {
          d: [
            new MatrixEvent({
              type: EventType.RTCDecline,
              content: {
                "m.relates_to": {
                  rel_type: "m.reference",
                  event_id: "$decl1",
                },
              },
            }),
            {} as Room,
            undefined,
            false,
            {} as IRoomTimelineData,
          ],
        }),
        options: {
          waitForCallPickup: true,
          autoLeaveWhenOthersLeft: false,
        },
        localUser: localRtcMember,
      };
      const lifecycle = createCallNotificationLifecycle$(props);
      expectObservable(lifecycle.callPickupState$).toBe("a 9ms b 29ms e", {
        a: "unknown",
        b: "ringing",
        e: "decline",
      });
    });
  });
  it("decline after timeout window ends -> stays timeout", () => {
    withTestScheduler(({ scope, hot, behavior, expectObservable }) => {
      // Someone joins at 20ms (both LiveKit participant and MatrixRTC member)
      const props: CallNotificationLifecycleProps = {
        scope,
        memberships$: scope.behavior(
          behavior("a", {
            a: [localRtcMember],
          }).pipe(trackEpoch()),
        ),
        sentCallNotification$: hot("10ms a", {
          a: [mockRingEvent("$decl", 20), mockLegacyRingEvent],
        }),
        receivedDecline$: hot("40ms d", {
          d: [
            new MatrixEvent({
              type: EventType.RTCDecline,
              content: {
                "m.relates_to": {
                  rel_type: "m.reference",
                  event_id: "$decl",
                },
              },
            }),
            {} as Room,
            undefined,
            false,
            {} as IRoomTimelineData,
          ],
        }),
        options: {
          waitForCallPickup: true,
          autoLeaveWhenOthersLeft: false,
        },
        localUser: localRtcMember,
      };
      const lifecycle = createCallNotificationLifecycle$(props);
      expectObservable(lifecycle.callPickupState$, "50ms !").toBe(
        "a 9ms b 19ms e",
        {
          a: "unknown",
          b: "ringing",
          e: "timeout",
        },
      );
    });
  });
  //
  function testStaysRinging(
    declineEvent: Partial<IEvent>,
    expectDecline: boolean,
  ): void {
    withTestScheduler(({ scope, hot, behavior, expectObservable }) => {
      // Someone joins at 20ms (both LiveKit participant and MatrixRTC member)
      const props: CallNotificationLifecycleProps = {
        scope,
        memberships$: scope.behavior(
          behavior("a", {
            a: [localRtcMember],
          }).pipe(trackEpoch()),
        ),
        sentCallNotification$: hot("10ms a", {
          a: [mockRingEvent("$right", 50), mockLegacyRingEvent],
        }),
        receivedDecline$: hot("20ms d", {
          d: [
            new MatrixEvent(declineEvent),
            {} as Room,
            undefined,
            false,
            {} as IRoomTimelineData,
          ],
        }),
        options: {
          waitForCallPickup: true,
          autoLeaveWhenOthersLeft: false,
        },
        localUser: localRtcMember,
      };
      const lifecycle = createCallNotificationLifecycle$(props);
      const marbles = expectDecline ? "a 9ms b 9ms d" : "a 9ms b";
      expectObservable(lifecycle.callPickupState$, "21ms !").toBe(marbles, {
        a: "unknown",
        b: "ringing",
        d: "decline",
      });
    });
  }
  const reference = (refId?: string, sender?: string): Partial<IEvent> => ({
    event_id: "$decline",
    type: EventType.RTCDecline,
    sender: sender ?? "@other:example.org",
    content: {
      "m.relates_to": {
        rel_type: "m.reference",
        event_id: refId ?? "$right",
      },
    },
  });
  it("decline reference works", () => {
    testStaysRinging(reference(), true);
  });
  it("decline with wrong id is ignored (stays ringing)", () => {
    testStaysRinging(reference("$wrong"), false);
  });
  it("decline with wrong id is ignored (stays ringing)", () => {
    testStaysRinging(reference(undefined, local.userId), false);
  });
});
