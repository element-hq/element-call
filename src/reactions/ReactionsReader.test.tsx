/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { renderHook } from "@testing-library/react";
import { afterEach, test, vitest } from "vitest";
import { type MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc";
import {
  RoomEvent as MatrixRoomEvent,
  MatrixEvent,
  type IRoomTimelineData,
  EventType,
  MatrixEventEvent,
} from "matrix-js-sdk/src/matrix";

import { ReactionsReader, REACTION_ACTIVE_TIME_MS } from "./ReactionsReader";
import {
  alice,
  aliceRtcMember,
  local,
  localRtcMember,
} from "../utils/test-fixtures";
import { getBasicRTCSession } from "../utils/test-viewmodel";
import { withTestScheduler } from "../utils/test";
import { ElementCallReactionEventType, ReactionSet } from ".";

afterEach(() => {
  vitest.useRealTimers();
});

test("handles a hand raised reaction", () => {
  const { rtcSession } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        rtcSession as unknown as MatrixRTCSession,
      );
      schedule("ab", {
        a: () => {},
        b: () => {
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: EventType.Reaction,
              origin_server_ts: localTimestamp.getTime(),
              content: {
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                  key: "🖐️",
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
      });
      expectObservable(raisedHands$).toBe("ab", {
        a: {},
        b: {
          [`${localRtcMember.sender}:${localRtcMember.deviceId}`]: {
            reactionEventId,
            membershipEventId: localRtcMember.eventId,
            time: localTimestamp,
          },
        },
      });
    });
  });
});

test("handles a redaction", () => {
  const { rtcSession } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        rtcSession as unknown as MatrixRTCSession,
      );
      schedule("abc", {
        a: () => {},
        b: () => {
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: EventType.Reaction,
              origin_server_ts: localTimestamp.getTime(),
              content: {
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                  key: "🖐️",
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
        c: () => {
          rtcSession.room.emit(
            MatrixRoomEvent.Redaction,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: EventType.RoomRedaction,
              redacts: reactionEventId,
            }),
            rtcSession.room,
            undefined,
          );
        },
      });
      expectObservable(raisedHands$).toBe("abc", {
        a: {},
        b: {
          [`${localRtcMember.sender}:${localRtcMember.deviceId}`]: {
            reactionEventId,
            membershipEventId: localRtcMember.eventId,
            time: localTimestamp,
          },
        },
        c: {},
      });
    });
  });
});

test("handles waiting for event decryption", () => {
  const { rtcSession } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        rtcSession as unknown as MatrixRTCSession,
      );
      schedule("abc", {
        a: () => {},
        b: () => {
          const encryptedEvent = new MatrixEvent({
            room_id: rtcSession.room.roomId,
            event_id: reactionEventId,
            sender: localRtcMember.sender,
            type: EventType.Reaction,
            origin_server_ts: localTimestamp.getTime(),
            content: {
              "m.relates_to": {
                event_id: localRtcMember.eventId,
                key: "🖐️",
              },
            },
          });
          // Should ignore encrypted events that are still encrypting
          encryptedEvent["decryptionPromise"] = Promise.resolve();
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            encryptedEvent,
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
        c: () => {
          rtcSession.room.client.emit(
            MatrixEventEvent.Decrypted,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: EventType.Reaction,
              origin_server_ts: localTimestamp.getTime(),
              content: {
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                  key: "🖐️",
                },
              },
            }),
          );
        },
      });
      expectObservable(raisedHands$).toBe("a-c", {
        a: {},
        c: {
          [`${localRtcMember.sender}:${localRtcMember.deviceId}`]: {
            reactionEventId,
            membershipEventId: localRtcMember.eventId,
            time: localTimestamp,
          },
        },
      });
    });
  });
});

test("hands rejecting events without a proper membership", () => {
  const { rtcSession } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        rtcSession as unknown as MatrixRTCSession,
      );
      schedule("ab", {
        a: () => {},
        b: () => {
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: EventType.Reaction,
              origin_server_ts: localTimestamp.getTime(),
              content: {
                "m.relates_to": {
                  event_id: "$not-this-one:example.org",
                  key: "🖐️",
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
      });
      expectObservable(raisedHands$).toBe("a-", {
        a: {},
      });
    });
  });
});

test("handles a reaction", () => {
  const { rtcSession } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const reaction = ReactionSet[1];

  vitest.useFakeTimers();
  vitest.setSystemTime(0);

  withTestScheduler(({ schedule, time, expectObservable }) => {
    renderHook(() => {
      const { reactions$ } = new ReactionsReader(
        rtcSession as unknown as MatrixRTCSession,
      );
      schedule(`abc`, {
        a: () => {},
        b: () => {
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: ElementCallReactionEventType,
              content: {
                emoji: reaction.emoji,
                name: reaction.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
        c: () => {
          vitest.advanceTimersByTime(REACTION_ACTIVE_TIME_MS);
        },
      });
      expectObservable(reactions$).toBe(
        `ab ${REACTION_ACTIVE_TIME_MS - 1}ms c`,
        {
          a: {},
          b: {
            [`${localRtcMember.sender}:${localRtcMember.deviceId}`]: {
              reactionOption: reaction,
              expireAfter: new Date(REACTION_ACTIVE_TIME_MS),
            },
          },
          // Expect reaction to expire.
          c: {},
        },
      );
    });
  });
});

test("ignores bad reaction events", () => {
  const { rtcSession } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const reaction = ReactionSet[1];

  vitest.setSystemTime(0);

  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { reactions$ } = new ReactionsReader(
        rtcSession as unknown as MatrixRTCSession,
      );
      schedule("ab", {
        a: () => {},
        b: () => {
          // Missing content
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: ElementCallReactionEventType,
              content: {},
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
          // Wrong relates event
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: ElementCallReactionEventType,
              content: {
                emoji: reaction.emoji,
                name: reaction.name,
                "m.relates_to": {
                  event_id: "wrong-event",
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
          // Wrong rtc member event
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: aliceRtcMember.sender,
              type: ElementCallReactionEventType,
              content: {
                emoji: reaction.emoji,
                name: reaction.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
          // No emoji
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: ElementCallReactionEventType,
              content: {
                name: reaction.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
          // Invalid emoji
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: ElementCallReactionEventType,
              content: {
                emoji: " ",
                name: reaction.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
      });
      expectObservable(reactions$).toBe("a-", {
        a: {},
      });
    });
  });
});

test("that reactions cannot be spammed", () => {
  const { rtcSession } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const reactionA = ReactionSet[1];
  const reactionB = ReactionSet[2];

  vitest.useFakeTimers();
  vitest.setSystemTime(0);

  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { reactions$ } = new ReactionsReader(
        rtcSession as unknown as MatrixRTCSession,
      );
      schedule("abcd", {
        a: () => {},
        b: () => {
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: ElementCallReactionEventType,
              content: {
                emoji: reactionA.emoji,
                name: reactionA.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
        c: () => {
          rtcSession.room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: rtcSession.room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.sender,
              type: ElementCallReactionEventType,
              content: {
                emoji: reactionB.emoji,
                name: reactionB.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            rtcSession.room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
        d: () => {
          vitest.advanceTimersByTime(REACTION_ACTIVE_TIME_MS);
        },
      });
      expectObservable(reactions$).toBe(
        `ab- ${REACTION_ACTIVE_TIME_MS - 2}ms d`,
        {
          a: {},
          b: {
            [`${localRtcMember.sender}:${localRtcMember.deviceId}`]: {
              reactionOption: reactionA,
              expireAfter: new Date(REACTION_ACTIVE_TIME_MS),
            },
          },
          d: {},
        },
      );
    });
  });
});
