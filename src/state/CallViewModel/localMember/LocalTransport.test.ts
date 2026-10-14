/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from "vitest";
import fetchMock from "fetch-mock";
import { MatrixError } from "matrix-js-sdk";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";

import {
  mockConfig,
  mockRtcMembership,
  ownMemberMock,
} from "../../../utils/test";
import { getLocalTransport, type LocalTransportClient } from "./LocalTransport";
import { MatrixRTCTransportMissingError } from "../../../utils/errors";
import { customTransport } from "../../../settings/settings";

/**
 * Builds a JWT whose payload states whether the issuing server lets us publish.
 */
function jwtWithPublishGrant(canPublish: boolean): string {
  return [
    {}, // header
    { sub: "identity", video: { room: "room", canPublish } }, // payload
    {}, // signature
  ]
    .map((d) => global.btoa(JSON.stringify(d)))
    .join(".");
}

const bobSfu = { type: "livekit", url: "wss://sfu.bob.com" };
const carolSfu = { type: "livekit", url: "wss://sfu.carol.com" };

// Bob is the oldest member, Carol joined after him
const bob = mockRtcMembership("@bob:bob.com", "BOB", {
  fociPreferred: [bobSfu],
  membership: { created_ts: 100 },
});
const carol = mockRtcMembership("@carol:carol.com", "CAROL", {
  fociPreferred: [carolSfu],
  membership: { created_ts: 200 },
});
const legacyDave = mockRtcMembership("@dave:dave.com", "DAVE", {
  fociPreferred: [
    { type: "livekit", livekit_service_url: "https://jwt.dave.com" },
  ],
  membership: { created_ts: 50 },
});

describe("LocalTransport", () => {
  let client: MockedObject<LocalTransportClient>;
  const params = (
    memberships: CallMembership[] = [],
  ): Parameters<typeof getLocalTransport>[0] => ({
    client,
    memberships,
    ownMembershipIdentity: ownMemberMock,
    roomId: "!room:example.org",
    slotId: "m.call#ROOM",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig({});
    customTransport.setValue(customTransport.defaultValue);
    client = {
      getDomain: vi.fn().mockReturnValue("example.org"),
      _unstable_getRTCTransports: vi.fn().mockResolvedValue([]),
      _unstable_getLivekitToken: vi
        .fn()
        .mockRejectedValue(
          new MatrixError({ errcode: "M_UNRECOGNIZED", error: "" }, 404),
        ),
    };
  });

  afterEach(() => {
    fetchMock.reset();
  });

  it("throws if config is missing", async () => {
    await expect(getLocalTransport(params())).rejects.toThrow(
      new MatrixRTCTransportMissingError("example.org"),
    );
  });

  describe("local transport configuration mechanisms", () => {
    it("supports getting transport via application config", async () => {
      mockConfig({
        livekit: { livekit_service_url: "https://lk.example.org" },
      });

      expect(await getLocalTransport(params())).toStrictEqual({
        transport: {
          livekit_service_url: "https://lk.example.org",
          type: "livekit",
        },
        serverName: "example.org",
      });
    });

    it("supports getting transport via user settings", async () => {
      customTransport.setValue({
        type: "livekit",
        livekit_service_url: "https://lk.example.org",
      });

      expect(await getLocalTransport(params())).toStrictEqual({
        transport: {
          livekit_service_url: "https://lk.example.org",
          type: "livekit",
        },
        serverName: "example.org",
      });
    });

    it("locates a custom transport with server_name on that homeserver", async () => {
      customTransport.setValue({
        type: "livekit",
        url: "wss://sfu.bob.com",
        server_name: "bob.com",
      });

      expect(await getLocalTransport(params())).toStrictEqual({
        transport: {
          type: "livekit",
          url: "wss://sfu.bob.com",
          server_name: "bob.com",
        },
        serverName: "bob.com",
      });
    });

    it("supports getting transport via backend", async () => {
      client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", livekit_service_url: "https://lk.example.org" },
      ]);

      expect(await getLocalTransport(params())).toStrictEqual({
        transport: {
          livekit_service_url: "https://lk.example.org",
          type: "livekit",
        },
        serverName: "example.org",
      });
    });

    it("prefers a local transport over other members' SFUs", async () => {
      client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", url: "wss://sfu.example.org" },
      ]);

      expect(await getLocalTransport(params([bob]))).toStrictEqual({
        transport: { type: "livekit", url: "wss://sfu.example.org" },
        serverName: "example.org",
      });
      expect(client._unstable_getLivekitToken).not.toHaveBeenCalled();
    });

    it("throws if no options are available", async () => {
      await expect(getLocalTransport(params())).rejects.toThrow(
        new MatrixRTCTransportMissingError("example.org"),
      );
    });
  });

  describe("publishing on another member's SFU", () => {
    beforeEach(() => {
      client._unstable_getLivekitToken.mockResolvedValue({
        jwt: jwtWithPublishGrant(true),
      });
    });

    it("publishes on the oldest member's SFU with its server_name", async () => {
      expect(await getLocalTransport(params([carol, bob]))).toStrictEqual({
        transport: {
          type: "livekit",
          url: "wss://sfu.bob.com",
          server_name: "bob.com",
        },
        serverName: "bob.com",
      });
      expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(1);
      expect(client._unstable_getLivekitToken).toHaveBeenCalledWith({
        url: "wss://sfu.bob.com",
        server_name: "bob.com",
        room_id: "!room:example.org",
        slot_id: "m.call#ROOM",
        member_id: ownMemberMock.memberId,
      });
    });

    it("ignores members publishing through a legacy JWT service", async () => {
      expect(await getLocalTransport(params([legacyDave, bob]))).toMatchObject({
        serverName: "bob.com",
      });
      expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(1);
    });

    it("moves on when a homeserver does not let us publish", async () => {
      client._unstable_getLivekitToken.mockImplementation(
        async ({ server_name }) =>
          Promise.resolve({
            jwt: jwtWithPublishGrant(server_name === "carol.com"),
          }),
      );

      expect(await getLocalTransport(params([bob, carol]))).toMatchObject({
        serverName: "carol.com",
      });
      expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(2);
    });

    it("moves on when a homeserver refuses to issue a token", async () => {
      client._unstable_getLivekitToken.mockImplementation(
        async ({ server_name }) =>
          server_name === "bob.com"
            ? Promise.reject(
                new MatrixError(
                  { errcode: "M_FORBIDDEN", error: "Not joined" },
                  403,
                ),
              )
            : Promise.resolve({ jwt: jwtWithPublishGrant(true) }),
      );

      expect(await getLocalTransport(params([bob, carol]))).toMatchObject({
        serverName: "carol.com",
      });
    });

    it("throws once all candidates are exhausted", async () => {
      client._unstable_getLivekitToken.mockResolvedValue({
        jwt: jwtWithPublishGrant(false),
      });

      await expect(getLocalTransport(params([bob, carol]))).rejects.toThrow(
        new MatrixRTCTransportMissingError("example.org"),
      );
      expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(2);
    });

    it("gives up immediately if our homeserver lacks the CS API", async () => {
      client._unstable_getLivekitToken.mockRejectedValue(
        new MatrixError({ errcode: "M_UNRECOGNIZED", error: "" }, 404),
      );

      await expect(getLocalTransport(params([bob, carol]))).rejects.toThrow(
        new MatrixRTCTransportMissingError("example.org"),
      );
      expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(1);
    });
  });
});
