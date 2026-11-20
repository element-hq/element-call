/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import {
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  type Room,
} from "matrix-js-sdk";
import { type ReactionEventContent } from "matrix-js-sdk/lib/types";
import {
  RelationType,
  EventType,
  RoomEvent as MatrixRoomEvent,
} from "matrix-js-sdk";
import {
  BehaviorSubject,
  combineLatest,
  delay,
  map,
  of,
  switchMap,
} from "rxjs";
import { type RTCMember } from "@element-hq/matrixrtc-sdk";

import {
  ElementCallReactionEventType,
  type ECallReactionEventContent,
  GenericReaction,
  ReactionSet,
  type RaisedHandInfo,
  type ReactionInfo,
} from ".";
import { type ObservableScope } from "../state/ObservableScope";
import { type Behavior } from "../state/Behavior";

export const REACTION_ACTIVE_TIME_MS = 3000;

/** A member's membership event, which its reactions relate to. */
interface MembershipEvent {
  userId: string;
  deviceId: string;
  eventId: string;
}

/**
 * Listens for reactions to the slot members' memberships and populates
 * subjects for consumption by the CallViewModel.
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

  private memberships: MembershipEvent[] = [];

  public constructor(
    private readonly scope: ObservableScope,
    members$: Behavior<RTCMember[]>,
    private readonly room: Pick<
      Room,
      // To ignore events from other rooms
      | "roomId"
      // The raised hands already in the room, as reactions to memberships
      | "relations"
      // `on`/`off`, to listen for:
      // - `RoomEvent.Timeline` (new reactions)
      // - `RoomEvent.Redaction` (lowered hands)
      // - `RoomEvent.LocalEchoUpdated` (the real id of our own reactions)
      | "on"
      | "off"
    >,
    private readonly client: Pick<
      MatrixClient,
      // Reactions that arrived encrypted
      | "decryptEventIfNeeded"
      // `on`/`off`, to listen for:
      // - `MatrixEventEvent.Decrypted` (reactions once decrypted)
      | "on"
      | "off"
    >,
  ) {
    // Hide reactions after a given time.
    this.reactionsSubject$
      .pipe(delay(REACTION_ACTIVE_TIME_MS), this.scope.bind())
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

    // TODO: Convert this class to the functional reactive style and get rid of
    // all this manual setup and teardown for event listeners

    this.room.on(MatrixRoomEvent.Timeline, this.handleReactionEvent);
    this.scope.onEnd(() =>
      this.room.off(MatrixRoomEvent.Timeline, this.handleReactionEvent),
    );

    this.room.on(MatrixRoomEvent.Redaction, this.handleReactionEvent);
    this.scope.onEnd(() =>
      this.room.off(MatrixRoomEvent.Redaction, this.handleReactionEvent),
    );

    this.client.on(MatrixEventEvent.Decrypted, this.handleReactionEvent);
    this.scope.onEnd(() =>
      this.client.off(MatrixEventEvent.Decrypted, this.handleReactionEvent),
    );

    // We listen for a local echo to get the real event ID, as timeline events
    // may still be sending.
    this.room.on(MatrixRoomEvent.LocalEchoUpdated, this.handleReactionEvent);
    this.scope.onEnd(() =>
      this.room.off(MatrixRoomEvent.LocalEchoUpdated, this.handleReactionEvent),
    );

    members$
      .pipe(
        switchMap((members) =>
          members.length === 0
            ? of([])
            : combineLatest(
                members.map(({ userId, deviceId, matrixEventId$ }) =>
                  matrixEventId$.pipe(
                    map((eventId) => ({ userId, deviceId, eventId })),
                  ),
                ),
              ),
        ),
        this.scope.bind(),
      )
      .subscribe(this.onMembershipsChanged);
  }

  /**
   * Fetches any hand wave reactions by the given sender on the given
   * membership event.
   * @param membershipEventId - The user membership event id.
   * @param expectedSender - The expected sender of the reaction.
   * @returns A MatrixEvent if one was found.
   */
  private getLastReactionEvent(
    membershipEventId: string,
    expectedSender: string,
  ): MatrixEvent | undefined {
    const relations = this.room.relations.getChildEventsForEvent(
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
   * @param memberships The membership events of everyone in the call now.
   */
  private onMembershipsChanged = (memberships: MembershipEvent[]): void => {
    this.memberships = memberships;
    // Remove any raised hands for users no longer joined to the call.
    const present = new Set(
      memberships.map((m) => `${m.userId}:${m.deviceId}`),
    );
    for (const identifier of Object.keys(this.raisedHandsSubject$.value).filter(
      (rhId) => !present.has(rhId),
    )) {
      this.removeRaisedHand(identifier);
    }

    // For each member in the call, check to see if a reaction has
    // been raised and adjust.
    for (const m of memberships) {
      const identifier = `${m.userId}:${m.deviceId}`;
      if (
        this.raisedHandsSubject$.value[identifier] &&
        this.raisedHandsSubject$.value[identifier].membershipEventId !==
          m.eventId
      ) {
        // Membership event for sender has changed since the hand
        // was raised, reset.
        this.removeRaisedHand(identifier);
      }
      const reaction = this.getLastReactionEvent(m.eventId, m.userId);
      if (reaction) {
        const eventId = reaction?.getId();
        if (!eventId) {
          continue;
        }
        this.addRaisedHand(`${m.userId}:${m.deviceId}`, {
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
    // Decrypted events might come from a different room
    if (event.getRoomId() !== this.room.roomId) return;
    // Skip any events that are still sending.
    if (event.isSending()) return;

    const sender = event.getSender();
    const reactionEventId = event.getId();
    // Skip any event without a sender or event ID.
    if (!sender || !reactionEventId) return;

    this.client
      .decryptEventIfNeeded(event)
      .catch((e) => logger.warn(`Failed to decrypt ${event.getId()}`, e));
    if (event.isBeingDecrypted() || event.isDecryptionFailure()) return;

    if (event.getType() === ElementCallReactionEventType) {
      const content: ECallReactionEventContent = event.getContent();

      const membershipEventId = content?.["m.relates_to"]?.event_id;
      const membershipEvent = this.memberships.find(
        (e) => e.eventId === membershipEventId && e.userId === sender,
      );
      // Check to see if this reaction was made to a membership event (and the
      // sender of the reaction matches the membership)
      if (!membershipEvent) {
        logger.warn(
          `Reaction target was not a membership event for ${sender}, ignoring`,
        );
        return;
      }
      // TODO refactor to use memer id `membershipEvent.membershipID` (needs to happen in combination with other memberId refactors)
      const identifier = `${membershipEvent.userId}:${membershipEvent.deviceId}`;

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
      const membershipEvent = this.memberships.find(
        (e) => e.eventId === membershipEventId && e.userId === sender,
      );
      if (!membershipEvent) {
        logger.warn(
          `Reaction target was not a membership event for ${sender}, ignoring`,
        );
        return;
      }

      if (content?.["m.relates_to"].key === "🖐️") {
        this.addRaisedHand(
          `${membershipEvent.userId}:${membershipEvent.deviceId}`,
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
}
