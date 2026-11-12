/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { MatrixError } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { beforeEach, describe, expect, it, type Mocked, vi } from "vitest";

import { mockRtcMembership, ownMemberMock } from "../../utils/test";
import { type ClientGetTokenParts } from "./auth/csApi";
import { findRemotePublishLivekitTransport } from "./RemotePublishTransport";

/** A JWT whose payload states whether the issuing server lets us publish. */
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
const bobsTransport = { ...bobSfu, server_name: "bob.com" };
const carolsTransport = { ...carolSfu, server_name: "carol.com" };

// Bob is the oldest member, Carol joined after him
const bob = mockRtcMembership("@bob:bob.com", "BOB", {
  fociPreferred: [bobSfu],
  membership: { created_ts: 100 },
});
const carol = mockRtcMembership("@carol:carol.com", "CAROL", {
  fociPreferred: [carolSfu],
  membership: { created_ts: 200 },
});
// Bob's other device, and Dave who publishes on Bob's SFU remotely
const bobsLaptop = mockRtcMembership("@bob:bob.com", "LAPTOP", {
  fociPreferred: [bobSfu],
  membership: { created_ts: 150 },
});
const dave = mockRtcMembership("@dave:dave.com", "DAVE", {
  fociPreferred: [bobsTransport],
  membership: { created_ts: 160 },
});
const legacyErin = mockRtcMembership("@erin:erin.com", "ERIN", {
  fociPreferred: [
    { type: "livekit", livekit_service_url: "https://jwt.erin.com" },
  ],
  membership: { created_ts: 50 },
});
const ourselves = mockRtcMembership(
  ownMemberMock.userId,
  ownMemberMock.deviceId,
  {
    fociPreferred: [{ type: "livekit", url: "wss://sfu.example.org" }],
    membership: { created_ts: 10 },
  },
);

const csApiMissing = new MatrixError(
  { errcode: "M_UNRECOGNIZED", error: "" },
  404,
);

describe("findRemotePublishLivekitTransport", () => {
  let client: Mocked<ClientGetTokenParts>;
  const find = async (
    memberships: CallMembership[],
  ): ReturnType<typeof findRemotePublishLivekitTransport> =>
    findRemotePublishLivekitTransport({
      client,
      memberships,
      ownMembershipIdentity: ownMemberMock,
      roomId: "!room:example.org",
      slotId: "m.call#ROOM",
      logger,
    });

  beforeEach(() => {
    client = {
      _unstable_getLivekitToken: vi
        .fn()
        .mockResolvedValue({ jwt: jwtWithPublishGrant(true) }),
    };
  });

  it("publishes on the oldest member's SFU with its server_name", async () => {
    await expect(find([carol, bob])).resolves.toEqual(bobsTransport);
    expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(1);
    expect(client._unstable_getLivekitToken).toHaveBeenCalledWith({
      url: "wss://sfu.bob.com",
      server_name: "bob.com",
      room_id: "!room:example.org",
      slot_id: "m.call#ROOM",
      member_id: ownMemberMock.memberId,
    });
  });

  it("asks about an SFU once however many members are on it", async () => {
    client._unstable_getLivekitToken.mockResolvedValue({
      jwt: jwtWithPublishGrant(false),
    });

    await expect(find([dave, bobsLaptop, bob])).resolves.toBeNull();
    expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(1);
  });

  it("skips our own membership", async () => {
    await expect(find([ourselves, bob])).resolves.toEqual(bobsTransport);
    expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(1);
  });

  it("ignores members publishing through a legacy JWT service", async () => {
    await expect(find([legacyErin, bob])).resolves.toEqual(bobsTransport);
    expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(1);
  });

  it("moves on when a homeserver does not let us publish", async () => {
    client._unstable_getLivekitToken.mockImplementation(
      async ({ server_name }) =>
        Promise.resolve({
          jwt: jwtWithPublishGrant(server_name === "carol.com"),
        }),
    );

    await expect(find([bob, carol])).resolves.toEqual(carolsTransport);
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

    await expect(find([bob, carol])).resolves.toEqual(carolsTransport);
  });

  it("finds nothing once all candidates are exhausted", async () => {
    client._unstable_getLivekitToken.mockResolvedValue({
      jwt: jwtWithPublishGrant(false),
    });

    await expect(find([bob, carol])).resolves.toBeNull();
    expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(2);
  });

  it("gives up immediately if our homeserver lacks the CS API", async () => {
    client._unstable_getLivekitToken.mockRejectedValue(csApiMissing);

    await expect(find([bob, carol])).resolves.toBeNull();
    expect(client._unstable_getLivekitToken).toHaveBeenCalledTimes(1);
  });

  it("finds nothing where there are no other members", async () => {
    await expect(find([ourselves])).resolves.toBeNull();
    expect(client._unstable_getLivekitToken).not.toHaveBeenCalled();
  });
});
