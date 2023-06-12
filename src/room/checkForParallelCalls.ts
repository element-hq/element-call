/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
