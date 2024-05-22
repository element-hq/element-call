/*
Copyright 2024 New Vector Ltd

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

import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";

import { enterRTCSession } from "../src/rtcSessionHelpers";
import { Config } from "../src/config/Config";

test("initBeforeReact sets font family from URL param", async () => {
  const focusFromOlderMembership = {
    type: "livekit",
    livekit_service_url: "http://my-oldest-member-service-url.com",
    livekit_alias: "my-oldest-member-service-alias",
  };

  const focusConfigFromWellKnown = {
    type: "livekit",
    livekit_service_url: "http://my-well-known-service-url.com",
  };
  const focusConfigFromWellKnown2 = {
    type: "livekit",
    livekit_service_url: "http://my-well-known-service-url2.com",
  };
  const clientWellKnown = {
    "org.matrix.rtc_foci": [
      focusConfigFromWellKnown,
      focusConfigFromWellKnown2,
    ],
  };

  vi.spyOn(Config, "get").mockReturnValue({
    livekit: { livekit_service_url: "http://my-default-service-url.com" },
    eula: "",
  });
  const mockedSession = vi.mocked({
    room: {
      roomId: "roomId",
      client: {
        getClientWellKnown: vi.fn().mockReturnValue(clientWellKnown),
      },
    },
    memberships: [],
    getOldestMembership: vi.fn().mockReturnValue({
      getPreferredFoci: vi.fn().mockReturnValue([focusFromOlderMembership]),
    }),
    joinRoomSession: vi.fn(),
  }) as unknown as MatrixRTCSession;
  await enterRTCSession(mockedSession, false);

  expect(mockedSession.joinRoomSession).toHaveBeenLastCalledWith(
    {
      focus_selection: "oldest_membership",
      type: "livekit",
    },
    [
      {
        livekit_alias: "my-oldest-member-service-alias",
        livekit_service_url: "http://my-oldest-member-service-url.com",
        type: "livekit",
      },
      {
        livekit_alias: "roomId",
        livekit_service_url: "http://my-well-known-service-url.com",
        type: "livekit",
      },
      {
        livekit_alias: "roomId",
        livekit_service_url: "http://my-well-known-service-url2.com",
        type: "livekit",
      },
      {
        livekit_alias: "roomId",
        livekit_service_url: "http://my-default-service-url.com",
        type: "livekit",
      },
    ],
    { manageMediaKeys: false },
  );
});
