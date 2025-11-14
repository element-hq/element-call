/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ICallNotifyContent,
  type IRTCNotificationContent,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { describe, it } from "vitest";

import { E2eeType } from "../../e2ee/e2eeType";
import { withTestScheduler } from "../../utils/test";
import {
  aliceParticipant,
  aliceRtcMember,
  local,
  localRtcMember,
} from "../../utils/test-fixtures";
import {
  createCallNotificationLifecycle$,
  type Props as CallNotificationLifecycleProps,
} from "./CallNotificationLifecycle";
import { trackEpoch } from "../ObservableScope";
import { withCallViewModel } from "./CallViewModelTestUtils.test";

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
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: behavior("a--b", {
            a: [],
            b: [aliceParticipant],
          }),
          rtcMembers$: behavior("a--b", {
            a: [localRtcMember],
            b: [localRtcMember, aliceRtcMember],
          }),
        },
        (vm, rtcSession) => {
          schedule("          5ms r", {
            r: () => {
              rtcSession.emit(
                MatrixRTCSessionEvent.DidSendCallNotification,
                mockRingEvent("$notif5", 30),
                mockLegacyRingEvent,
              );
            },
          });
          expectObservable(vm.callPickupState$).toBe("(n)", {
            n: null,
          });
        },
        {
          waitForCallPickup: false,
          encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        },
      );
    });
  });

  // it("decline before timeout window ends -> decline", () => {
  //   withTestScheduler(({ schedule, expectObservable }) => {
  //     withCallViewModel(
  //       {},
  //       (vm, rtcSession) => {
  //         // Notify at 10ms with 50ms lifetime, decline at 40ms with matching id
  //         schedule("          10ms r 29ms d", {
  //           r: () => {
  //             rtcSession.emit(
  //               MatrixRTCSessionEvent.DidSendCallNotification,
  //               mockRingEvent("$decl1", 50),
  //               mockLegacyRingEvent,
  //             );
  //           },
  //           d: () => {
  //             // Emit decline timeline event with id matching the notification
  //             rtcSession.room.emit(
  //               MatrixRoomEvent.Timeline,
  //               new MatrixEvent({
  //                 type: EventType.RTCDecline,
  //                 content: {
  //                   "m.relates_to": {
  //                     rel_type: "m.reference",
  //                     event_id: "$decl1",
  //                   },
  //                 },
  //               }),
  //               rtcSession.room,
  //               undefined,
  //               false,
  //               {} as IRoomTimelineData,
  //             );
  //           },
  //         });
  //         expectObservable(vm.callPickupState$).toBe("a 9ms b 29ms e", {
  //           a: "unknown",
  //           b: "ringing",
  //           e: "decline",
  //         });
  //       },
  //       {
  //         waitForCallPickup: true,
  //         encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
  //       },
  //     );
  //   });
  // });
  // it("decline after timeout window ends -> stays timeout", () => {
  //   withTestScheduler(({ schedule, expectObservable }) => {
  //     withCallViewModel(
  //       {},
  //       (vm, rtcSession) => {
  //         // Notify at 10ms with 20ms lifetime (timeout at 30ms), decline at 40ms
  //         schedule("          10ms r 20ms t 10ms d", {
  //           r: () => {
  //             rtcSession.emit(
  //               MatrixRTCSessionEvent.DidSendCallNotification,
  //               mockRingEvent("$decl2", 20),
  //               mockLegacyRingEvent,
  //             );
  //           },
  //           t: () => {},
  //           d: () => {
  //             rtcSession.room.emit(
  //               MatrixRoomEvent.Timeline,
  //               new MatrixEvent({
  //                 event_id: "$decl2",
  //                 type: "m.rtc.decline",
  //               }),
  //               rtcSession.room,
  //               undefined,
  //               false,
  //               {} as IRoomTimelineData,
  //             );
  //           },
  //         });
  //         expectObservable(vm.callPickupState$).toBe("a 9ms b 19ms c", {
  //           a: "unknown",
  //           b: "ringing",
  //           c: "timeout",
  //         });
  //       },
  //       {
  //         waitForCallPickup: true,
  //         encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
  //       },
  //     );
  //   });
  // });
  // function testStaysRinging(declineEvent: Partial<IEvent>): void {
  //   withTestScheduler(({ schedule, expectObservable }) => {
  //     withCallViewModel(
  //       {},
  //       (vm, rtcSession) => {
  //         // Notify at 10ms with id A, decline arrives at 20ms with id B
  //         schedule("          10ms r 10ms d", {
  //           r: () => {
  //             rtcSession.emit(
  //               MatrixRTCSessionEvent.DidSendCallNotification,
  //               mockRingEvent("$right", 50),
  //               mockLegacyRingEvent,
  //             );
  //           },
  //           d: () => {
  //             rtcSession.room.emit(
  //               MatrixRoomEvent.Timeline,
  //               new MatrixEvent(declineEvent),
  //               rtcSession.room,
  //               undefined,
  //               false,
  //               {} as IRoomTimelineData,
  //             );
  //           },
  //         });
  //         // We assert up to 21ms to see the ringing at 10ms and no change at 20ms
  //         expectObservable(vm.callPickupState$, "21ms !").toBe("a 9ms b", {
  //           a: "unknown",
  //           b: "ringing",
  //         });
  //       },
  //       {
  //         waitForCallPickup: true,
  //         encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
  //       },
  //     );
  //   });
  // }
  // it("decline with wrong id is ignored (stays ringing)", () => {
  //   testStaysRinging({
  //     event_id: "$wrong",
  //     type: "m.rtc.decline",
  //     sender: local.userId,
  //   });
  // });
  // it("decline with sender being the local user is ignored (stays ringing)", () => {
  //   testStaysRinging({
  //     event_id: "$right",
  //     type: "m.rtc.decline",
  //     sender: alice.userId,
  //   });
  // });
});
