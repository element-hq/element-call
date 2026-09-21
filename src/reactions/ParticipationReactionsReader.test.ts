/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { MockElementCallMatrixClientDriver } from "../driver/MockElementCallMatrixClientDriver";
import { testScope } from "../utils/test";
import { FakeParticipation, fakeMembership } from "../utils/test-participation";
import { ElementCallReactionEventType, type RaisedHandInfo } from ".";
import { ParticipationReactionsReader } from "./ParticipationReactionsReader";

const alice = fakeMembership({
  member: {
    memberId: "m-alice",
    userId: "@alice:example.org",
    deviceId: "ALICE",
    eventId: "$alice-join",
  },
});
const aliceId = "@alice:example.org:ALICE";

function raisedHand(
  timeline: MockElementCallMatrixClientDriver,
  member = alice,
  eventId = "$hand",
): void {
  timeline.emitTimelineEvent({
    eventId,
    type: "m.reaction",
    sender: member.member.userId,
    content: {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: member.member.eventId,
        key: "🖐️",
      },
    },
    originServerTs: 1000,
  });
}

function setUp(): {
  rtcParticipationManager: FakeParticipation;
  timeline: MockElementCallMatrixClientDriver;
  hands: () => Record<string, RaisedHandInfo>;
  reactions: () => string[];
} {
  const rtcParticipationManager = new FakeParticipation();
  const timeline = new MockElementCallMatrixClientDriver();
  const reader = new ParticipationReactionsReader(
    testScope(),
    rtcParticipationManager,
    timeline,
  );
  let hands: Record<string, RaisedHandInfo> = {};
  reader.raisedHands$.subscribe((h) => (hands = h));
  let reactions: string[] = [];
  reader.reactions$.subscribe(
    (r) => (reactions = Object.values(r).map((v) => v.reactionOption.emoji)),
  );
  return {
    rtcParticipationManager,
    timeline,
    hands: () => hands,
    reactions: () => reactions,
  };
}

describe("ParticipationReactionsReader", () => {
  it("raises and lowers a hand with the member's reaction and its redaction", () => {
    const { rtcParticipationManager, timeline, hands } = setUp();
    rtcParticipationManager.setMemberships([alice]);
    raisedHand(timeline);
    expect(hands()).toEqual({
      [aliceId]: {
        membershipEventId: "$alice-join",
        reactionEventId: "$hand",
        time: new Date(1000),
      },
    });
    timeline.emitTimelineEvent({
      eventId: "$redaction",
      type: "m.room.redaction",
      sender: alice.member.userId,
      content: {},
      originServerTs: 2000,
      redacts: "$hand",
    });
    expect(hands()).toEqual({});
  });

  it("ignores a reaction that does not relate to the sender's own membership", () => {
    const { rtcParticipationManager, timeline, hands } = setUp();
    rtcParticipationManager.setMemberships([alice]);
    timeline.emitTimelineEvent({
      eventId: "$forged",
      type: "m.reaction",
      sender: "@mallory:example.org",
      content: {
        "m.relates_to": {
          rel_type: "m.annotation",
          event_id: "$alice-join",
          key: "🖐️",
        },
      },
      originServerTs: 1000,
    });
    expect(hands()).toEqual({});
  });

  it("picks up a hand raised before we looked, and drops it when the member leaves", () => {
    const { rtcParticipationManager, timeline, hands } = setUp();
    // The reaction is already in the room when the roster arrives.
    raisedHand(timeline);
    expect(hands()).toEqual({});
    rtcParticipationManager.setMemberships([alice]);
    expect(Object.keys(hands())).toEqual([aliceId]);
    rtcParticipationManager.setMemberships([]);
    expect(hands()).toEqual({});
  });

  it("re-resolves a hand when the member re-sends their membership", () => {
    const { rtcParticipationManager, timeline, hands } = setUp();
    rtcParticipationManager.setMemberships([alice]);
    raisedHand(timeline);
    expect(Object.keys(hands())).toEqual([aliceId]);
    // A new membership event without a hand on it: the hand goes.
    const resent = fakeMembership({
      member: { ...alice.member, eventId: "$alice-join-2" },
    });
    rtcParticipationManager.setMemberships([resent]);
    expect(hands()).toEqual({});
    // Raised again on the new event: back.
    raisedHand(timeline, resent, "$hand-2");
    expect(hands()[aliceId]?.membershipEventId).toBe("$alice-join-2");
  });

  it("shows a reaction keyed by the member's media id", () => {
    const { rtcParticipationManager, timeline, reactions } = setUp();
    rtcParticipationManager.setMemberships([alice]);
    timeline.emitTimelineEvent({
      eventId: "$reaction",
      type: ElementCallReactionEventType,
      sender: alice.member.userId,
      content: {
        "m.relates_to": { rel_type: "m.reference", event_id: "$alice-join" },
        emoji: "🎉",
        name: "party",
      },
      originServerTs: 1000,
    });
    expect(reactions()).toEqual(["🎉"]);
  });
});
