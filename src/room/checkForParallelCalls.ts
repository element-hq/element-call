/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { EventType } from "matrix-js-sdk/src/@types/event";
import { RoomState } from "matrix-js-sdk/src/models/room-state";

import { PosthogAnalytics } from "../analytics/PosthogAnalytics";

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * Checks the state of a room for multiple calls happening in parallel, sending
 * the details to PostHog if that is indeed what's happening. (This is unwanted
 * as it indicates a split-brain scenario.)
 */
export function checkForParallelCalls(state: RoomState): void {
  const now = Date.now();
  const participantsPerCall = new Map<string, number>();

  // For each participant in each call, increment the participant count
  for (const e of state.getStateEvents(EventType.GroupCallMemberPrefix)) {
    const content = e.getContent<Record<string, unknown>>();
    const calls: unknown[] = Array.isArray(content["m.calls"])
      ? content["m.calls"]
      : [];

    for (const call of calls) {
      if (isObject(call) && typeof call["m.call_id"] === "string") {
        const devices: unknown[] = Array.isArray(call["m.devices"])
          ? call["m.devices"]
          : [];

        for (const device of devices) {
          if (isObject(device) && (device["expires_ts"] as number) > now) {
            const participantCount =
              participantsPerCall.get(call["m.call_id"]) ?? 0;
            participantsPerCall.set(call["m.call_id"], participantCount + 1);
          }
        }
      }
    }
  }

  if (participantsPerCall.size > 1) {
    PosthogAnalytics.instance.trackEvent({
      eventName: "ParallelCalls",
      participantsPerCall: Object.fromEntries(participantsPerCall),
    });
  }
}
