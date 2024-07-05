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

import { vi, Mocked } from "vitest";
import { RoomState } from "matrix-js-sdk/src/models/room-state";

import { PosthogAnalytics } from "../../src/analytics/PosthogAnalytics";
import { checkForParallelCalls } from "../../src/room/checkForParallelCalls";
import { withFakeTimers } from "../utils/test";

const withMockedPosthog = (
  continuation: (posthog: Mocked<PosthogAnalytics>) => void,
): void => {
  const posthog = vi.mocked({
    trackEvent: vi.fn(),
  } as unknown as PosthogAnalytics);
  const instanceSpy = vi
    .spyOn(PosthogAnalytics, "instance", "get")
    .mockReturnValue(posthog);
  try {
    continuation(posthog);
  } finally {
    instanceSpy.mockRestore();
  }
};

const mockRoomState = (
  groupCallMemberContents: Record<string, unknown>[],
): RoomState => {
  const stateEvents = groupCallMemberContents.map((content) => ({
    getContent: (): Record<string, unknown> => content,
  }));
  return { getStateEvents: () => stateEvents } as unknown as RoomState;
};

test("checkForParallelCalls does nothing if all participants are in the same call", () => {
  withFakeTimers(() => {
    withMockedPosthog((posthog) => {
      const roomState = mockRoomState([
        {
          "m.calls": [
            {
              "m.call_id": "1",
              "m.devices": [
                {
                  device_id: "Element Call",
                  session_id: "a",
                  expires_ts: Date.now() + 1000,
                },
              ],
            },
            {
              "m.call_id": null, // invalid
              "m.devices": [
                {
                  device_id: "Element Android",
                  session_id: "a",
                  expires_ts: Date.now() + 1000,
                },
              ],
            },
            null, // invalid
          ],
        },
        {
          "m.calls": [
            {
              "m.call_id": "1",
              "m.devices": [
                {
                  device_id: "Element Desktop",
                  session_id: "a",
                  expires_ts: Date.now() + 1000,
                },
              ],
            },
          ],
        },
      ]);

      checkForParallelCalls(roomState);
      expect(posthog.trackEvent).not.toHaveBeenCalled();
    });
  });
});

test("checkForParallelCalls sends diagnostics to PostHog if there is a split-brain", () => {
  withFakeTimers(() => {
    withMockedPosthog((posthog) => {
      const roomState = mockRoomState([
        {
          "m.calls": [
            {
              "m.call_id": "1",
              "m.devices": [
                {
                  device_id: "Element Call",
                  session_id: "a",
                  expires_ts: Date.now() + 1000,
                },
              ],
            },
            {
              "m.call_id": "2",
              "m.devices": [
                {
                  device_id: "Element Android",
                  session_id: "a",
                  expires_ts: Date.now() + 1000,
                },
              ],
            },
          ],
        },
        {
          "m.calls": [
            {
              "m.call_id": "1",
              "m.devices": [
                {
                  device_id: "Element Desktop",
                  session_id: "a",
                  expires_ts: Date.now() + 1000,
                },
              ],
            },
            {
              "m.call_id": "2",
              "m.devices": [
                {
                  device_id: "Element Call",
                  session_id: "a",
                  expires_ts: Date.now() - 1000,
                },
              ],
            },
          ],
        },
      ]);

      checkForParallelCalls(roomState);
      expect(posthog.trackEvent).toHaveBeenCalledWith({
        eventName: "ParallelCalls",
        participantsPerCall: {
          "1": 2,
          "2": 1,
        },
      });
    });
  });
});
