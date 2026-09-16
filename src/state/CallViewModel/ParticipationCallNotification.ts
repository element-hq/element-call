/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type RTCCallIntent,
  type RTCNotificationType,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  BehaviorSubject,
  Observable,
  pairwise,
  startWith,
  withLatestFrom,
} from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../Behavior";
import { type Epoch, type ObservableScope } from "../ObservableScope";
import { type FfiMembership } from "../../matrix-rtc-sdk";
import { type TimelineDriver } from "../../driver/ElementCallMatrixClientDriver";
import {
  type CallNotificationWrapper,
  type DeclineEvent,
} from "./CallNotificationLifecycle";

/** MSC4075, the unstable spelling every client sends and listens for. */
export const RTC_NOTIFICATION_EVENT_TYPE =
  "org.matrix.msc4075.rtc.notification";
/** MSC4310. */
export const RTC_DECLINE_EVENT_TYPE = "org.matrix.msc4310.rtc.decline";
/** How long a ring is offered for, as matrix-js-sdk has it. */
export const NOTIFICATION_LIFETIME_MS = 90_000;

/** What sending the notification needs from a {@link CallParticipation}. */
export interface ParticipationNotificationSource {
  ownMembership$: Behavior<FfiMembership | null>;
  memberships$: Behavior<Epoch<FfiMembership[]>>;
}

interface Props {
  scope: ObservableScope;
  participation: ParticipationNotificationSource;
  timeline: TimelineDriver;
  options: {
    /** Whether and what kind of notification to send when joining the call. */
    sendNotificationType?: RTCNotificationType;
    /** The kind of call being placed. */
    callIntent?: RTCCallIntent;
  };
  logger: Logger;
}

/**
 * Sends the call notification (`m.rtc.notification`) when we start a call:
 * once our own membership has echoed back from the homeserver, and only if
 * nobody else was in the session before us — whoever is first rings the
 * room. Emits what was sent, so ringing can wait for the pickup, decline or
 * timeout that relates to it. Resets when we leave, so a later join can
 * ring again.
 */
export function createParticipationSentCallNotification$({
  scope,
  participation,
  timeline,
  options: { sendNotificationType, callIntent },
  logger: parentLogger,
}: Props): Behavior<CallNotificationWrapper | null> {
  const logger = parentLogger.getChild("[CallNotification]");
  const sent$ = new BehaviorSubject<CallNotificationWrapper | null>(null);
  if (sendNotificationType === undefined) return scope.behavior(sent$);

  participation.ownMembership$
    .pipe(
      startWith(null),
      pairwise(),
      withLatestFrom(participation.memberships$),
      scope.bind(),
    )
    .subscribe(([[previous, own], memberships]) => {
      if (own === null) {
        // Left (or not in yet): the next join decides afresh.
        if (previous !== null) sent$.next(null);
        return;
      }
      if (previous !== null) return; // Already in; a refresh, not a join.
      const others = memberships.value.filter(
        (m) => m.member.memberId !== own.member.memberId,
      );
      if (others.length > 0) {
        logger.debug(
          `Not sending a call notification: ${others.length} member(s) were in the session before us`,
        );
        return;
      }
      const eventId = own.member.eventId;
      if (eventId === undefined) {
        logger.warn(
          "Own membership has no event id; cannot send the call notification",
        );
        return;
      }
      const content: Record<string, unknown> = {
        "m.mentions": { user_ids: [], room: true },
        notification_type: sendNotificationType,
        "m.relates_to": { event_id: eventId, rel_type: "m.reference" },
        sender_ts: Date.now(),
        lifetime: NOTIFICATION_LIFETIME_MS,
      };
      if (callIntent !== undefined) content["m.call.intent"] = callIntent;
      timeline.sendRoomEvent(RTC_NOTIFICATION_EVENT_TYPE, content).then(
        ({ eventId: notificationEventId }) => {
          logger.info(`Sent call notification ${notificationEventId}`);
          sent$.next({
            event_id: notificationEventId,
            ...(content as Omit<CallNotificationWrapper, "event_id">),
          });
        },
        (e) => logger.error("Failed to send the call notification", e),
      );
    });

  return scope.behavior(sent$);
}

/** Declines (`m.rtc.decline`) arriving in the room, for the ringing outcome. */
export function createParticipationReceivedDecline$(
  timeline: TimelineDriver,
): Observable<DeclineEvent> {
  return new Observable<DeclineEvent>((subscriber) =>
    timeline.subscribeTimeline((event) => {
      if (event.type !== RTC_DECLINE_EVENT_TYPE) return;
      const relation = event.content["m.relates_to"] as
        | { rel_type?: string; event_id?: string }
        | undefined;
      subscriber.next({
        sender: event.sender,
        relatesTo: relation
          ? { relType: relation.rel_type, eventId: relation.event_id }
          : undefined,
      });
    }),
  );
}
