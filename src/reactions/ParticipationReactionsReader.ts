/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, delay } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  ElementCallReactionEventType,
  GenericReaction,
  type RaisedHandInfo,
  type ReactionInfo,
  ReactionSet,
} from ".";
import { REACTION_ACTIVE_TIME_MS } from "./ReactionsReader";
import { type Behavior } from "../state/Behavior";
import { type Epoch, type ObservableScope } from "../state/ObservableScope";
import { type FfiMembership } from "../matrix-rtc-sdk";
import {
  type TimelineDriver,
  type TimelineEvent,
} from "../driver/ElementCallMatrixClientDriver";
import { memberMediaId } from "../state/rtc/mediaId";

const RAISED_HAND_KEY = "🖐️";
const REACTION_EVENT_TYPE = "m.reaction";
const REDACTION_EVENT_TYPE = "m.room.redaction";

/** What the reader needs from a {@link RtcParticipationManager}. */
export interface ParticipationReactionsSource {
  memberships$: Behavior<Epoch<FfiMembership[]>>;
}

interface Relation {
  rel_type?: string;
  event_id?: string;
  key?: string;
}

function relationOf(content: Record<string, unknown>): Relation | undefined {
  return content["m.relates_to"] as Relation | undefined;
}

/**
 * Raised hands and reactions over a {@link RtcParticipationManager} and the client
 * driver's timeline: the counterpart of {@link ReactionsReader}, which reads
 * the same from a matrix-js-sdk session.
 *
 * Hands and reactions relate to the sender's current membership event, as
 * they always have. Both outputs are keyed by the member's media id
 * (`${userId}:${deviceId}`), which is what the tiles are keyed by.
 */
export class ParticipationReactionsReader {
  private readonly raisedHandsSubject$ = new BehaviorSubject<
    Record<string, RaisedHandInfo>
  >({});
  public readonly raisedHands$ = this.raisedHandsSubject$.asObservable();

  private readonly reactionsSubject$ = new BehaviorSubject<
    Record<string, ReactionInfo>
  >({});
  public readonly reactions$ = this.reactionsSubject$.asObservable();

  private memberships: FfiMembership[] = [];

  public constructor(
    scope: ObservableScope,
    rtcParticipationManager: ParticipationReactionsSource,
    private readonly timeline: Pick<
      TimelineDriver,
      "subscribeTimeline" | "getRelatedEvents"
    >,
  ) {
    // Hide reactions after a given time.
    this.reactionsSubject$
      .pipe(delay(REACTION_ACTIVE_TIME_MS), scope.bind())
      .subscribe((reactions) => {
        const date = new Date();
        const nextEntries = Object.fromEntries(
          Object.entries(reactions).filter(([_, hr]) => hr.expireAfter > date),
        );
        if (Object.keys(reactions).length === Object.keys(nextEntries).length)
          return;
        this.reactionsSubject$.next(nextEntries);
      });

    scope.onEnd(timeline.subscribeTimeline(this.handleEvent));
    rtcParticipationManager.memberships$
      .pipe(scope.bind())
      .subscribe((memberships) => this.onMembershipsChanged(memberships.value));
  }

  /** The member whose current membership event is `eventId`, sent by `sender`. */
  private memberFor(
    eventId: string | undefined,
    sender: string,
  ): FfiMembership | undefined {
    if (eventId === undefined) return undefined;
    return this.memberships.find(
      (m) => m.member.eventId === eventId && m.member.userId === sender,
    );
  }

  /** The hand `member` has raised on their current membership event, if any. */
  private findRaisedHand(member: FfiMembership): RaisedHandInfo | undefined {
    const eventId = member.member.eventId;
    if (eventId === undefined) return undefined;
    const reaction = this.timeline
      .getRelatedEvents(eventId, "m.annotation", REACTION_EVENT_TYPE)
      .find(
        (e) =>
          e.sender === member.member.userId &&
          relationOf(e.content)?.key === RAISED_HAND_KEY,
      );
    if (reaction === undefined) return undefined;
    return {
      membershipEventId: eventId,
      reactionEventId: reaction.eventId,
      time: new Date(reaction.originServerTs),
    };
  }

  /**
   * Drops the hands of members who left, keeps a hand across a re-sent
   * membership when it was raised again on the new event, and picks up hands
   * that were raised before we looked.
   */
  private onMembershipsChanged(memberships: FfiMembership[]): void {
    this.memberships = memberships;
    const present = new Map(
      memberships.map((m) => [memberMediaId(m.member), m]),
    );
    const hands = { ...this.raisedHandsSubject$.value };
    let changed = false;

    for (const id of Object.keys(hands)) {
      const member = present.get(id);
      if (member === undefined) {
        delete hands[id];
        changed = true;
      } else if (hands[id].membershipEventId !== member.member.eventId) {
        // The member re-sent their membership: the hand stands only if it
        // was raised on the new event too.
        const hand = this.findRaisedHand(member);
        if (hand) hands[id] = hand;
        else delete hands[id];
        changed = true;
      }
    }
    for (const [id, member] of present) {
      if (id in hands) continue;
      const hand = this.findRaisedHand(member);
      if (hand) {
        hands[id] = hand;
        changed = true;
      }
    }
    if (changed) this.raisedHandsSubject$.next(hands);
  }

  private addRaisedHand(identifier: string, info: RaisedHandInfo): void {
    this.raisedHandsSubject$.next({
      ...this.raisedHandsSubject$.value,
      [identifier]: info,
    });
  }

  private removeRaisedHand(identifier: string): void {
    this.raisedHandsSubject$.next(
      Object.fromEntries(
        Object.entries(this.raisedHandsSubject$.value).filter(
          ([id]) => id !== identifier,
        ),
      ),
    );
  }

  private handleEvent = (event: TimelineEvent): void => {
    if (event.type === ElementCallReactionEventType) {
      const relation = relationOf(event.content);
      const member = this.memberFor(relation?.event_id, event.sender);
      if (member === undefined) {
        logger.warn(
          `Reaction target was not a membership event for ${event.sender}, ignoring`,
        );
        return;
      }
      const identifier = memberMediaId(member.member);
      const rawEmoji = event.content.emoji;
      if (typeof rawEmoji !== "string" || rawEmoji === "") {
        logger.warn(`Reaction had no emoji from ${event.eventId}`);
        return;
      }
      const emoji = new Intl.Segmenter(undefined, { granularity: "grapheme" })
        .segment(rawEmoji)
        [Symbol.iterator]()
        .next().value?.segment;
      if (!emoji?.trim()) {
        logger.warn(
          `Reaction had no emoji from ${event.eventId} after splitting`,
        );
        return;
      }
      const reaction = {
        ...GenericReaction,
        emoji,
        // If we don't find a reaction, we can fallback to the generic sound.
        ...ReactionSet.find((r) => r.name === event.content.name),
      };
      const current = this.reactionsSubject$.value;
      if (current[identifier]) {
        // We've still got a reaction from this user, ignore it to prevent spamming
        logger.warn(`Got reaction from ${identifier} but one is still playing`);
        return;
      }
      this.reactionsSubject$.next({
        ...current,
        [identifier]: {
          reactionOption: reaction,
          expireAfter: new Date(Date.now() + REACTION_ACTIVE_TIME_MS),
        },
      });
    } else if (event.type === REACTION_EVENT_TYPE) {
      const relation = relationOf(event.content);
      const member = this.memberFor(relation?.event_id, event.sender);
      if (member === undefined) {
        logger.warn(
          `Reaction target was not a membership event for ${event.sender}, ignoring`,
        );
        return;
      }
      if (relation?.key === RAISED_HAND_KEY)
        this.addRaisedHand(memberMediaId(member.member), {
          reactionEventId: event.eventId,
          membershipEventId: relation.event_id!,
          time: new Date(event.originServerTs),
        });
    } else if (event.type === REDACTION_EVENT_TYPE) {
      const redacts =
        event.redacts ?? (event.content.redacts as string | undefined);
      const target = Object.entries(this.raisedHandsSubject$.value).find(
        ([, hand]) => hand.reactionEventId === redacts,
      )?.[0];
      if (target !== undefined) this.removeRaisedHand(target);
    }
  };
}
