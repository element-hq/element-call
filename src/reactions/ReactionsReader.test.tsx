/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { renderHook } from "@testing-library/react";
import { afterEach, test, vitest } from "vitest";
import {
  RoomEvent as MatrixRoomEvent,
  MatrixEvent,
  type IRoomTimelineData,
  EventType,
  MatrixEventEvent,
} from "matrix-js-sdk";

import { ReactionsReader, REACTION_ACTIVE_TIME_MS } from "./ReactionsReader";
import {
  alice,
  aliceRtcMember,
  local,
  localRtcMember,
} from "../utils/test-fixtures";
import { getBasicRTCSession } from "../utils/test-viewmodel";
import { mockRtcMembership, testScope, withTestScheduler } from "../utils/test";
import { ElementCallReactionEventType, ReactionSet } from ".";

afterEach(() => {
  vitest.useRealTimers();
});

function raiseLocalHand(
  matrixRoom: ReturnType<typeof getBasicRTCSession>["matrixRoom"],
  reactionEventId: string,
  localTimestamp: Date,
): void {
  matrixRoom.emit(
    MatrixRoomEvent.Timeline,
    new MatrixEvent({
      room_id: matrixRoom.roomId,
      event_id: reactionEventId,
      sender: localRtcMember.userId,
      type: EventType.Reaction,
      origin_server_ts: localTimestamp.getTime(),
      content: {
        "m.relates_to": { event_id: localRtcMember.eventId, key: "🖐️" },
      },
    }),
    matrixRoom,
    undefined,
    false,
    {} as IRoomTimelineData,
  );
}

test("lowers the hand of a member who leaves", () => {
  const { members$, matrixRoom, client, rtcMemberships$ } = getBasicRTCSession([
    local,
    alice,
  ]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        testScope(),
        members$,
        matrixRoom,
        client,
      );
      schedule("abc", {
        a: () => {},
        b: () => raiseLocalHand(matrixRoom, reactionEventId, localTimestamp),
        c: () => rtcMemberships$.next([aliceRtcMember]),
      });
      expectObservable(raisedHands$).toBe("abc", {
        a: {},
        b: {
          [`${localRtcMember.userId}:${localRtcMember.deviceId}`]: {
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

test("lowers the hand of a member whose membership is sent again", () => {
  const { members$, matrixRoom, client, rtcMemberships$ } = getBasicRTCSession([
    local,
    alice,
  ]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  const resent = mockRtcMembership(
    localRtcMember.userId,
    localRtcMember.deviceId,
  );
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        testScope(),
        members$,
        matrixRoom,
        client,
      );
      schedule("abc", {
        a: () => {},
        b: () => raiseLocalHand(matrixRoom, reactionEventId, localTimestamp),
        c: () => rtcMemberships$.next([resent, aliceRtcMember]),
      });
      expectObservable(raisedHands$).toBe("abc", {
        a: {},
        b: {
          [`${localRtcMember.userId}:${localRtcMember.deviceId}`]: {
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

test("handles a hand raised reaction", () => {
  const { members$, matrixRoom, client } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        testScope(),
        members$,
        matrixRoom,
        client,
      );
      schedule("ab", {
        a: () => {},
        b: () => {
          matrixRoom.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: matrixRoom.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: EventType.Reaction,
              origin_server_ts: localTimestamp.getTime(),
              content: {
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                  key: "🖐️",
                },
              },
            }),
            matrixRoom,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
      });
      expectObservable(raisedHands$).toBe("ab", {
        a: {},
        b: {
          [`${localRtcMember.userId}:${localRtcMember.deviceId}`]: {
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
  const { members$, matrixRoom, client } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        testScope(),
        members$,
        matrixRoom,
        client,
      );
      schedule("abc", {
        a: () => {},
        b: () => {
          matrixRoom.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: matrixRoom.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: EventType.Reaction,
              origin_server_ts: localTimestamp.getTime(),
              content: {
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                  key: "🖐️",
                },
              },
            }),
            matrixRoom,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
        c: () => {
          matrixRoom.emit(
            MatrixRoomEvent.Redaction,
            new MatrixEvent({
              room_id: matrixRoom.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: EventType.RoomRedaction,
              redacts: reactionEventId,
            }),
            matrixRoom,
            undefined,
          );
        },
      });
      expectObservable(raisedHands$).toBe("abc", {
        a: {},
        b: {
          [`${localRtcMember.userId}:${localRtcMember.deviceId}`]: {
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
  const { members$, matrixRoom, client } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        testScope(),
        members$,
        matrixRoom,
        client,
      );
      schedule("abc", {
        a: () => {},
        b: () => {
          const encryptedEvent = new MatrixEvent({
            room_id: matrixRoom.roomId,
            event_id: reactionEventId,
            sender: localRtcMember.userId,
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
          matrixRoom.emit(
            MatrixRoomEvent.Timeline,
            encryptedEvent,
            matrixRoom,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
        c: () => {
          client.emit(
            MatrixEventEvent.Decrypted,
            new MatrixEvent({
              room_id: matrixRoom.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
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
          [`${localRtcMember.userId}:${localRtcMember.deviceId}`]: {
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
  const { members$, matrixRoom, client } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const localTimestamp = new Date();
  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { raisedHands$ } = new ReactionsReader(
        testScope(),
        members$,
        matrixRoom,
        client,
      );
      schedule("ab", {
        a: () => {},
        b: () => {
          matrixRoom.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: matrixRoom.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: EventType.Reaction,
              origin_server_ts: localTimestamp.getTime(),
              content: {
                "m.relates_to": {
                  event_id: "$not-this-one:example.org",
                  key: "🖐️",
                },
              },
            }),
            matrixRoom,
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
  const { members$, matrixRoom, client } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const reaction = ReactionSet[1];

  vitest.useFakeTimers();
  vitest.setSystemTime(0);

  withTestScheduler(({ schedule, time, expectObservable }) => {
    renderHook(() => {
      const { reactions$ } = new ReactionsReader(
        testScope(),
        members$,
        matrixRoom,
        client,
      );
      schedule(`abc`, {
        a: () => {},
        b: () => {
          matrixRoom.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: matrixRoom.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: ElementCallReactionEventType,
              content: {
                emoji: reaction.emoji,
                name: reaction.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            matrixRoom,
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
            [`${localRtcMember.userId}:${localRtcMember.deviceId}`]: {
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
  const {
    members$,
    matrixRoom: room,
    client,
  } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const reaction = ReactionSet[1];

  vitest.setSystemTime(0);

  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { reactions$ } = new ReactionsReader(
        testScope(),
        members$,
        room,
        client,
      );
      schedule("ab", {
        a: () => {},
        b: () => {
          // Missing content
          room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: ElementCallReactionEventType,
              content: {},
            }),
            room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
          // Wrong relates event
          room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: ElementCallReactionEventType,
              content: {
                emoji: reaction.emoji,
                name: reaction.name,
                "m.relates_to": {
                  event_id: "wrong-event",
                },
              },
            }),
            room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
          // Wrong rtc member event
          room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: room.roomId,
              event_id: reactionEventId,
              sender: aliceRtcMember.userId,
              type: ElementCallReactionEventType,
              content: {
                emoji: reaction.emoji,
                name: reaction.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
          // No emoji
          room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: ElementCallReactionEventType,
              content: {
                name: reaction.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            room,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
          // Invalid emoji
          room.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: room.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: ElementCallReactionEventType,
              content: {
                emoji: " ",
                name: reaction.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            room,
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
  const { members$, matrixRoom, client } = getBasicRTCSession([local, alice]);
  const reactionEventId = "$my_event_id:example.org";
  const reactionA = ReactionSet[1];
  const reactionB = ReactionSet[2];

  vitest.useFakeTimers();
  vitest.setSystemTime(0);

  withTestScheduler(({ schedule, expectObservable }) => {
    renderHook(() => {
      const { reactions$ } = new ReactionsReader(
        testScope(),
        members$,
        matrixRoom,
        client,
      );
      schedule("abcd", {
        a: () => {},
        b: () => {
          matrixRoom.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: matrixRoom.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: ElementCallReactionEventType,
              content: {
                emoji: reactionA.emoji,
                name: reactionA.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            matrixRoom,
            undefined,
            false,
            {} as IRoomTimelineData,
          );
        },
        c: () => {
          matrixRoom.emit(
            MatrixRoomEvent.Timeline,
            new MatrixEvent({
              room_id: matrixRoom.roomId,
              event_id: reactionEventId,
              sender: localRtcMember.userId,
              type: ElementCallReactionEventType,
              content: {
                emoji: reactionB.emoji,
                name: reactionB.name,
                "m.relates_to": {
                  event_id: localRtcMember.eventId,
                },
              },
            }),
            matrixRoom,
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
            [`${localRtcMember.userId}:${localRtcMember.deviceId}`]: {
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
