/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Custom Matrix event type for terminating a call for all participants.
 * When this event is sent to the room, all clients should automatically leave the call.
 */
export const ElementCallTerminateEventType = "io.element.call.terminate";

/**
 * Content structure for the call termination event.
 */
export interface CallTerminateEventContent {
  /** The user ID of the person who initiated the termination */
  terminated_by: string;
  /** Unix timestamp when the termination was initiated */
  timestamp: number;
  /** Optional reason for ending the call */
  reason?: string;
}

/**
 * Parsed termination event data for use in the application.
 */
export interface TerminationEvent {
  /** The user ID of the person who terminated the call */
  terminatedBy: string;
  /** Optional reason for ending the call */
  reason?: string;
  /** The timestamp when termination was initiated */
  timestamp: number;
}
