/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { testScope } from "../../utils/test";
import {
  FakeParticipation,
  fakeMembership,
} from "../../utils/test-participation";
import { MockElementCallMatrixClientDriver } from "../../driver/MockElementCallMatrixClientDriver";
import { waitFor } from "../../driver/MockRtcMatrixDriver";
import { type DeclineEvent } from "./CallNotificationLifecycle";
import {
  createParticipationReceivedDecline$,
  createParticipationSentCallNotification$,
  RTC_DECLINE_EVENT_TYPE,
  RTC_NOTIFICATION_EVENT_TYPE,
} from "./ParticipationCallNotification";

const own = fakeMembership({
  member: { memberId: "m-me", userId: "@me:x", eventId: "$my-join" },
});
const peer = fakeMembership({ member: { memberId: "m-peer" } });

describe("createParticipationSentCallNotification$", () => {
  it("rings once our membership echoes back, if we were first, and again after a rejoin", async () => {
    const rtcParticipationManager = new FakeParticipation();
    const timeline = new MockElementCallMatrixClientDriver();
    const sent$ = createParticipationSentCallNotification$({
      scope: testScope(),
      rtcParticipationManager,
      timeline,
      options: { sendNotificationType: "ring", callIntent: "video" },
      logger,
    });
    expect(sent$.value).toBeNull();

    // Our echo arrives; the roster has only us.
    rtcParticipationManager.setMemberships([own]);
    rtcParticipationManager.ownMembership$.next(own);
    await waitFor("notification sent", () => sent$.value !== null);
    const [call] = timeline.calls("sendRoomEvent");
    expect(call.eventType).toBe(RTC_NOTIFICATION_EVENT_TYPE);
    expect(call.content).toMatchObject({
      notification_type: "ring",
      "m.call.intent": "video",
      "m.relates_to": { event_id: "$my-join", rel_type: "m.reference" },
      lifetime: 90_000,
      "m.mentions": { user_ids: [], room: true },
    });
    expect(sent$.value).toMatchObject({
      event_id: call.eventId,
      notification_type: "ring",
    });

    // A refresh of our membership is not a join.
    rtcParticipationManager.ownMembership$.next({ ...own });
    expect(timeline.calls("sendRoomEvent")).toHaveLength(1);

    // We leave and come back alone: the room rings again.
    rtcParticipationManager.ownMembership$.next(null);
    rtcParticipationManager.setMemberships([]);
    expect(sent$.value).toBeNull();
    rtcParticipationManager.setMemberships([own]);
    rtcParticipationManager.ownMembership$.next(own);
    await waitFor(
      "second notification",
      () => timeline.calls("sendRoomEvent").length === 2,
    );
  });

  it("does not ring when somebody was in the session before us", async () => {
    const rtcParticipationManager = new FakeParticipation();
    const timeline = new MockElementCallMatrixClientDriver();
    const sent$ = createParticipationSentCallNotification$({
      scope: testScope(),
      rtcParticipationManager,
      timeline,
      options: { sendNotificationType: "ring" },
      logger,
    });
    rtcParticipationManager.setMemberships([peer, own]);
    rtcParticipationManager.ownMembership$.next(own);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(timeline.calls("sendRoomEvent")).toEqual([]);
    expect(sent$.value).toBeNull();
  });

  it("does nothing without a notification type", async () => {
    const rtcParticipationManager = new FakeParticipation();
    const timeline = new MockElementCallMatrixClientDriver();
    createParticipationSentCallNotification$({
      scope: testScope(),
      rtcParticipationManager,
      timeline,
      options: {},
      logger,
    });
    rtcParticipationManager.setMemberships([own]);
    rtcParticipationManager.ownMembership$.next(own);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(timeline.calls("sendRoomEvent")).toEqual([]);
  });
});

describe("createParticipationReceivedDecline$", () => {
  it("reports declines with who sent them and what they relate to", () => {
    const timeline = new MockElementCallMatrixClientDriver();
    const declines: DeclineEvent[] = [];
    createParticipationReceivedDecline$(timeline).subscribe((d) =>
      declines.push(d),
    );
    timeline.emitTimelineEvent({
      eventId: "$other",
      type: "m.room.message",
      sender: "@peer:x",
      content: {},
      originServerTs: 1,
    });
    timeline.emitTimelineEvent({
      eventId: "$decline",
      type: RTC_DECLINE_EVENT_TYPE,
      sender: "@peer:x",
      content: {
        "m.relates_to": { rel_type: "m.reference", event_id: "$notif" },
      },
      originServerTs: 2,
    });
    expect(declines).toEqual([
      {
        sender: "@peer:x",
        relatesTo: { relType: "m.reference", eventId: "$notif" },
      },
    ]);
  });
});
