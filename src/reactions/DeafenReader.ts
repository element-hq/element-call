/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  MatrixRTCSessionEvent,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { logger } from "matrix-js-sdk/lib/logger";
import { type MatrixEvent, MatrixEventEvent } from "matrix-js-sdk";
import { type ReactionEventContent } from "matrix-js-sdk/lib/types";
import {
  RelationType,
  EventType,
  RoomEvent as MatrixRoomEvent,
} from "matrix-js-sdk";
import { BehaviorSubject } from "rxjs";

import { ElementCallDeafenedKey, type DeafenedInfo } from ".";
import { type ObservableScope } from "../state/ObservableScope";

/**
 * Listens for deafen state reactions from an RTCSession and populates a subject
 * for consumption by the CallViewModel.
 */
export class DeafenReader {
  private readonly deafenedSubject$ = new BehaviorSubject<
    Record<string, DeafenedInfo>
  >({});

  /**
   * The latest set of deafened users.
   */
  public readonly deafened$ = this.deafenedSubject$.asObservable();

  public constructor(
    private readonly scope: ObservableScope,
    private readonly rtcSession: MatrixRTCSession,
  ) {
    this.rtcSession.room.on(MatrixRoomEvent.Timeline, this.handleEvent);
    this.scope.onEnd(() =>
      this.rtcSession.room.off(MatrixRoomEvent.Timeline, this.handleEvent),
    );

    this.rtcSession.room.on(MatrixRoomEvent.Redaction, this.handleEvent);
    this.scope.onEnd(() =>
      this.rtcSession.room.off(MatrixRoomEvent.Redaction, this.handleEvent),
    );

    this.rtcSession.room.client.on(
      MatrixEventEvent.Decrypted,
      this.handleEvent,
    );
    this.scope.onEnd(() =>
      this.rtcSession.room.client.off(
        MatrixEventEvent.Decrypted,
        this.handleEvent,
      ),
    );

    this.rtcSession.room.on(
      MatrixRoomEvent.LocalEchoUpdated,
      this.handleEvent,
    );
    this.scope.onEnd(() =>
      this.rtcSession.room.off(
        MatrixRoomEvent.LocalEchoUpdated,
        this.handleEvent,
      ),
    );

    this.rtcSession.on(
      MatrixRTCSessionEvent.MembershipsChanged,
      this.onMembershipsChanged,
    );
    this.scope.onEnd(() =>
      this.rtcSession.off(
        MatrixRTCSessionEvent.MembershipsChanged,
        this.onMembershipsChanged,
      ),
    );

    // Run this once to ensure we have fetched the state from the call.
    this.onMembershipsChanged([]);
  }

  /**
   * Fetches any deafen reactions by the given sender on the given
   * membership event.
   */
  private getLastDeafenEvent(
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
        reaction.getContent()?.["m.relates_to"]?.key ===
          ElementCallDeafenedKey,
    );
  }

  private onMembershipsChanged = (oldMemberships: CallMembership[]): void => {
    // Remove deafen state for users no longer joined to the call.
    for (const identifier of Object.keys(this.deafenedSubject$.value).filter(
      (id) => oldMemberships.find((u) => u.userId == id),
    )) {
      this.removeDeafened(identifier);
    }

    // For each member in the call, check to see if a deafen reaction exists.
    for (const m of this.rtcSession.memberships) {
      if (!m.userId || !m.eventId) {
        continue;
      }
      const identifier = `${m.userId}:${m.deviceId}`;
      if (
        this.deafenedSubject$.value[identifier] &&
        this.deafenedSubject$.value[identifier].membershipEventId !== m.eventId
      ) {
        // Membership event for sender has changed since deafen was set, reset.
        this.removeDeafened(identifier);
      }
      const reaction = this.getLastDeafenEvent(m.eventId, m.userId);
      if (reaction) {
        const eventId = reaction?.getId();
        if (!eventId) {
          continue;
        }
        this.addDeafened(`${m.userId}:${m.deviceId}`, {
          membershipEventId: m.eventId,
          reactionEventId: eventId,
        });
      }
    }
  };

  private addDeafened(identifier: string, info: DeafenedInfo): void {
    this.deafenedSubject$.next({
      ...this.deafenedSubject$.value,
      [identifier]: info,
    });
  }

  private removeDeafened(identifier: string): void {
    this.deafenedSubject$.next(
      Object.fromEntries(
        Object.entries(this.deafenedSubject$.value).filter(
          ([uId]) => uId !== identifier,
        ),
      ),
    );
  }

  private handleEvent = (event: MatrixEvent): void => {
    const room = this.rtcSession.room;
    if (event.getRoomId() !== room.roomId) return;
    if (event.isSending()) return;

    const sender = event.getSender();
    const reactionEventId = event.getId();
    if (!sender || !reactionEventId) return;

    room.client
      .decryptEventIfNeeded(event)
      .catch((e) => logger.warn(`Failed to decrypt ${event.getId()}`, e));
    if (event.isBeingDecrypted() || event.isDecryptionFailure()) return;

    if (event.getType() === EventType.Reaction) {
      const content = event.getContent() as ReactionEventContent;
      const membershipEventId = content["m.relates_to"].event_id;

      const membershipEvent = this.rtcSession.memberships.find(
        (e) => e.eventId === membershipEventId && e.userId === sender,
      );
      if (!membershipEvent) {
        return;
      }

      if (content?.["m.relates_to"].key === ElementCallDeafenedKey) {
        this.addDeafened(
          `${membershipEvent.userId}:${membershipEvent.deviceId}`,
          {
            reactionEventId,
            membershipEventId,
          },
        );
      }
    } else if (event.getType() === EventType.RoomRedaction) {
      const targetEvent = event.event.redacts;
      const targetUser = Object.entries(this.deafenedSubject$.value).find(
        ([_u, r]) => r.reactionEventId === targetEvent,
      )?.[0];
      if (!targetUser) {
        return;
      }
      this.removeDeafened(targetUser);
    }
  };
}
