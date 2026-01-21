/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixEvent, type MatrixClient } from "matrix-js-sdk";
import { RoomEvent as MatrixRoomEvent } from "matrix-js-sdk";
import { MatrixEventEvent } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { Subject } from "rxjs";

import {
  ElementCallTerminateEventType,
  type CallTerminateEventContent,
  type TerminationEvent,
} from ".";
import { type ObservableScope } from "../state/ObservableScope";

/**
 * Listens for call termination events from a RTCSession and emits
 * termination events for consumption by the CallViewModel.
 *
 * When another participant sends an `io.element.call.terminate` event,
 * all other participants should automatically leave the call.
 */
export class CallTerminationReader {
  private readonly terminationSubject$ = new Subject<TerminationEvent>();

  /**
   * Emits when the call is terminated by another participant.
   * Does not emit for events sent by the local user.
   */
  public readonly termination$ = this.terminationSubject$.asObservable();

  public constructor(
    private readonly scope: ObservableScope,
    private readonly rtcSession: MatrixRTCSession,
    private readonly client: MatrixClient,
  ) {
    // Listen for timeline events
    this.rtcSession.room.on(
      MatrixRoomEvent.Timeline,
      this.handleTerminationEvent,
    );
    this.scope.onEnd(() =>
      this.rtcSession.room.off(
        MatrixRoomEvent.Timeline,
        this.handleTerminationEvent,
      ),
    );

    // Also listen for decrypted events in E2EE rooms
    this.rtcSession.room.client.on(
      MatrixEventEvent.Decrypted,
      this.handleTerminationEvent,
    );
    this.scope.onEnd(() =>
      this.rtcSession.room.client.off(
        MatrixEventEvent.Decrypted,
        this.handleTerminationEvent,
      ),
    );
  }

  /**
   * Handle incoming Matrix events, filtering for termination events.
   */
  private handleTerminationEvent = (event: MatrixEvent): void => {
    const room = this.rtcSession.room;

    // Decrypted events might come from a different room
    if (event.getRoomId() !== room.roomId) return;

    // Skip any events that are still sending
    if (event.isSending()) return;

    // Only handle our custom termination event type
    if (event.getType() !== ElementCallTerminateEventType) return;

    const sender = event.getSender();
    const eventId = event.getId();

    // Skip events without sender or ID
    if (!sender || !eventId) return;

    // Try to decrypt if needed
    room.client
      .decryptEventIfNeeded(event)
      .catch((e) => logger.warn(`Failed to decrypt termination event ${eventId}`, e));

    if (event.isBeingDecrypted() || event.isDecryptionFailure()) return;

    // Ignore events sent by ourselves - we'll leave via our own hangup
    const localUserId = this.client.getUserId();
    if (sender === localUserId) {
      logger.debug(`Ignoring self-sent termination event from ${sender}`);
      return;
    }

    const content = event.getContent<CallTerminateEventContent>();

    // Validate content
    if (!content.terminated_by || !content.timestamp) {
      logger.warn(`Invalid termination event content from ${sender}`, content);
      return;
    }

    logger.info(`Call terminated by ${content.terminated_by}`);

    // Emit the termination event
    this.terminationSubject$.next({
      terminatedBy: content.terminated_by,
      reason: content.reason,
      timestamp: content.timestamp,
    });
  };
}
