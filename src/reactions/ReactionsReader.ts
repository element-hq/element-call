/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  MatrixRTCSessionEvent,
  type MatrixRTCSession,
} from "matrix-js-sdk/src/matrixrtc";
import { logger } from "matrix-js-sdk/src/logger";
import { type MatrixEvent, MatrixEventEvent } from "matrix-js-sdk/src/matrix";
import { type ReactionEventContent } from "matrix-js-sdk/src/types";
import {
  RelationType,
  EventType,
  RoomEvent as MatrixRoomEvent,
} from "matrix-js-sdk/src/matrix";
import { BehaviorSubject, delay, type Subscription } from "rxjs";

import {
  ElementCallReactionEventType,
  type ECallReactionEventContent,
  GenericReaction,
  ReactionSet,
  type RaisedHandInfo,
  type ReactionInfo,
} from ".";

export const REACTION_ACTIVE_TIME_MS = 3000;

/**
 * Listens for reactions from a RTCSession and populates subjects
 * for consumption by the CallViewModel.
 * @param rtcSession
 */
export class ReactionsReader {
  private readonly raisedHandsSubject$ = new BehaviorSubject<
    Record<string, RaisedHandInfo>
  >({});
  private readonly reactionsSubject$ = new BehaviorSubject<
    Record<string, ReactionInfo>
  >({});

  /**
   * The latest set of raised hands.
   */
  public readonly raisedHands$ = this.raisedHandsSubject$.asObservable();

  /**
   * The latest set of reactions.
   */
  public readonly reactions$ = this.reactionsSubject$.asObservable();

  private readonly reactionsSub: Subscription;

  public constructor(private readonly rtcSession: MatrixRTCSession) {
    // Hide reactions after a given time.
    this.reactionsSub = this.reactionsSubject$
      .pipe(delay(REACTION_ACTIVE_TIME_MS))
      .subscribe((reactions) => {
        const date = new Date();
        const nextEntries = Object.fromEntries(
          Object.entries(reactions).filter(([_, hr]) => hr.expireAfter > date),
        );
        if (Object.keys(reactions).length === Object.keys(nextEntries).length) {
          return;
        }
        this.reactionsSubject$.next(nextEntries);
      });

    this.rtcSession.room.on(MatrixRoomEvent.Timeline, this.handleReactionEvent);
    this.rtcSession.room.on(
      MatrixRoomEvent.Redaction,
      this.handleReactionEvent,
    );
    this.rtcSession.room.client.on(
      MatrixEventEvent.Decrypted,
      this.handleReactionEvent,
    );

    // We listen for a local echo to get the real event ID, as timeline events
    // may still be sending.
    this.rtcSession.room.on(
      MatrixRoomEvent.LocalEchoUpdated,
      this.handleReactionEvent,
    );

    rtcSession.on(
      MatrixRTCSessionEvent.MembershipsChanged,
      this.onMembershipsChanged,
    );

    // Run this once to ensure we have fetched the state from the call.
    this.onMembershipsChanged([]);
  }

  /**
   * Fetchest any hand wave reactions by the given sender on the given
   * membership event.
   * @param membershipEventId
   * @param expectedSender
   * @returns A MatrixEvent if one was found.
   */
  private getLastReactionEvent(
    membershipEventId: string,
    expectedSender: string,
  ): MatrixEvent | undefined {
    const relations = this.rtcSession.room.relations.getChildEventsForEvent(
      membershipEventId,
      RelationType.Annotation,
      EventType.Reaction,
    );
    const allEvents = relations?.getRelations() ?? [];
    return allEvents.find(
      (reaction) =>
        reaction.event.sender === expectedSender &&
        reaction.getType() === EventType.Reaction &&
        reaction.getContent()?.["m.relates_to"]?.key === "🖐️",
    );
  }

  /**
   * Will remove any hand raises by old members, and look for any
   * existing hand raises by new members.
   * @param oldMemberships Any members who have left the call.
   */
  private onMembershipsChanged = (oldMemberships: CallMembership[]): void => {
    // Remove any raised hands for users no longer joined to the call.
    for (const identifier of Object.keys(this.raisedHandsSubject$.value).filter(
      (rhId) => oldMemberships.find((u) => u.sender == rhId),
    )) {
      this.removeRaisedHand(identifier);
    }

    // For each member in the call, check to see if a reaction has
    // been raised and adjust.
    for (const m of this.rtcSession.memberships) {
      if (!m.sender || !m.eventId) {
        continue;
      }
      const identifier = `${m.sender}:${m.deviceId}`;
      if (
        this.raisedHandsSubject$.value[identifier] &&
        this.raisedHandsSubject$.value[identifier].membershipEventId !==
          m.eventId
      ) {
        // Membership event for sender has changed since the hand
        // was raised, reset.
        this.removeRaisedHand(identifier);
      }
      const reaction = this.getLastReactionEvent(m.eventId, m.sender);
      if (reaction) {
        const eventId = reaction?.getId();
        if (!eventId) {
          continue;
        }
        this.addRaisedHand(`${m.sender}:${m.deviceId}`, {
          membershipEventId: m.eventId,
          reactionEventId: eventId,
          time: new Date(reaction.localTimestamp),
        });
      }
    }
  };

  /**
   * Add a raised hand
   * @param identifier A userId:deviceId combination.
   * @param info The event information.
   */
  private addRaisedHand(identifier: string, info: RaisedHandInfo): void {
    this.raisedHandsSubject$.next({
      ...this.raisedHandsSubject$.value,
      [identifier]: info,
    });
  }

  /**
   * Remove a raised hand
   * @param identifier A userId:deviceId combination.
   */
  private removeRaisedHand(identifier: string): void {
    this.raisedHandsSubject$.next(
      Object.fromEntries(
        Object.entries(this.raisedHandsSubject$.value).filter(
          ([uId]) => uId !== identifier,
        ),
      ),
    );
  }

  /**
   * Handle a new reaction event, validating it's contents and potentially
   * updating the hand raise or reaction observers.
   * @param event The incoming matrix event, which may or may not be decrypted.
   */
  private handleReactionEvent = (event: MatrixEvent): void => {
    const room = this.rtcSession.room;
    // Decrypted events might come from a different room
    if (event.getRoomId() !== room.roomId) return;
    // Skip any events that are still sending.
    if (event.isSending()) return;

    const sender = event.getSender();
    const reactionEventId = event.getId();
    // Skip any event without a sender or event ID.
    if (!sender || !reactionEventId) return;

    room.client
      .decryptEventIfNeeded(event)
      .catch((e) => logger.warn(`Failed to decrypt ${event.getId()}`, e));
    if (event.isBeingDecrypted() || event.isDecryptionFailure()) return;

    if (event.getType() === ElementCallReactionEventType) {
      const content: ECallReactionEventContent = event.getContent();

      const membershipEventId = content?.["m.relates_to"]?.event_id;
      const membershipEvent = this.rtcSession.memberships.find(
        (e) => e.eventId === membershipEventId && e.sender === sender,
      );
      // Check to see if this reaction was made to a membership event (and the
      // sender of the reaction matches the membership)
      if (!membershipEvent) {
        logger.warn(
          `Reaction target was not a membership event for ${sender}, ignoring`,
        );
        return;
      }
      const identifier = `${membershipEvent.sender}:${membershipEvent.deviceId}`;

      if (!content.emoji) {
        logger.warn(`Reaction had no emoji from ${reactionEventId}`);
        return;
      }

      const segment = new Intl.Segmenter(undefined, {
        granularity: "grapheme",
      })
        .segment(content.emoji)
        [Symbol.iterator]();
      const emoji = segment.next().value?.segment;

      if (!emoji?.trim()) {
        logger.warn(
          `Reaction had no emoji from ${reactionEventId} after splitting`,
        );
        return;
      }

      // One of our custom reactions
      const reaction = {
        ...GenericReaction,
        emoji,
        // If we don't find a reaction, we can fallback to the generic sound.
        ...ReactionSet.find((r) => r.name === content.name),
      };

      const currentReactions = this.reactionsSubject$.value;
      if (currentReactions[identifier]) {
        // We've still got a reaction from this user, ignore it to prevent spamming
        logger.warn(`Got reaction from ${identifier} but one is still playing`);
        return;
      }
      this.reactionsSubject$.next({
        ...currentReactions,
        [identifier]: {
          reactionOption: reaction,
          expireAfter: new Date(Date.now() + REACTION_ACTIVE_TIME_MS),
        },
      });
    } else if (event.getType() === EventType.Reaction) {
      const content = event.getContent() as ReactionEventContent;
      const membershipEventId = content["m.relates_to"].event_id;

      // Check to see if this reaction was made to a membership event (and the
      // sender of the reaction matches the membership)
      const membershipEvent = this.rtcSession.memberships.find(
        (e) => e.eventId === membershipEventId && e.sender === sender,
      );
      if (!membershipEvent) {
        logger.warn(
          `Reaction target was not a membership event for ${sender}, ignoring`,
        );
        return;
      }

      if (content?.["m.relates_to"].key === "🖐️") {
        this.addRaisedHand(
          `${membershipEvent.sender}:${membershipEvent.deviceId}`,
          {
            reactionEventId,
            membershipEventId,
            time: new Date(event.localTimestamp),
          },
        );
      }
    } else if (event.getType() === EventType.RoomRedaction) {
      const targetEvent = event.event.redacts;
      const targetUser = Object.entries(this.raisedHandsSubject$.value).find(
        ([_u, r]) => r.reactionEventId === targetEvent,
      )?.[0];
      if (!targetUser) {
        // Reaction target was not for us, ignoring
        return;
      }
      this.removeRaisedHand(targetUser);
    }
  };

  /**
   * Stop listening for events.
   */
  public destroy(): void {
    this.rtcSession.off(
      MatrixRTCSessionEvent.MembershipsChanged,
      this.onMembershipsChanged,
    );
    this.rtcSession.room.off(
      MatrixRoomEvent.Timeline,
      this.handleReactionEvent,
    );
    this.rtcSession.room.off(
      MatrixRoomEvent.Redaction,
      this.handleReactionEvent,
    );
    this.rtcSession.room.client.off(
      MatrixEventEvent.Decrypted,
      this.handleReactionEvent,
    );
    this.rtcSession.room.off(
      MatrixRoomEvent.LocalEchoUpdated,
      this.handleReactionEvent,
    );
    this.reactionsSub.unsubscribe();
  }
}
