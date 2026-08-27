/*
Copyright 2026 Element Creations Ltd.

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
  vitest,
} from "vitest";
import { MatrixError } from "matrix-js-sdk";

import { getSFUToken } from "./sfuAuthAndDelegation";
import * as openIDSFULegacy from "./openIDSFULegacy";
import { type OpenIDClientParts } from "./openIDSFULegacy";
import { type SFUConfig } from "./SFUConfig";
import { testJWTToken } from "../utils/test-fixtures";
import { ownMemberMock } from "../utils/test";
import { JwtEndpointVersion } from "../state/CallViewModel/localMember/LocalTransport";

const serviceUrl = "https://sfu.example.org";
const wsUrl = "wss://livekit.example.org";
const roomId = "!example_room_id";

const legacyConfig: SFUConfig = {
  url: "wss://legacy.example.org",
  jwt: "legacy_jwt",
  livekitAlias: roomId,
  livekitIdentity: "@alice:example.org:DEVICE",
};

const expectedMember = {
  id: ownMemberMock.memberId,
  claimed_device_id: ownMemberMock.deviceId,
};

describe("getSFUToken", () => {
  let matrixClient: MockedObject<OpenIDClientParts>;
  let legacySpy: ReturnType<
    typeof vitest.spyOn<typeof openIDSFULegacy, "getSFUConfigLegacyWithOpenID">
  >;

  beforeEach(() => {
    matrixClient = {
      getOpenIdToken: vitest.fn(),
      getDeviceId: vitest.fn(),
      _unstable_getLivekitToken: vitest.fn(),
      _unstable_delegateDelayedLeave: vitest.fn(),
    } as unknown as MockedObject<OpenIDClientParts>;
    legacySpy = vitest
      .spyOn(openIDSFULegacy, "getSFUConfigLegacyWithOpenID")
      .mockResolvedValue(legacyConfig);
  });

  afterEach(() => {
    vitest.restoreAllMocks();
  });

  it("uses the CS-Api in matrix 2.0 mode", async () => {
    matrixClient._unstable_getLivekitToken.mockResolvedValue({
      jwt: testJWTToken,
    });

    const config = await getSFUToken(
      matrixClient,
      ownMemberMock,
      serviceUrl,
      roomId,
      {
        wsUrl,
        forceJwtEndpoint: JwtEndpointVersion.Matrix_2_0,
      },
    );

    expect(matrixClient._unstable_getLivekitToken).toHaveBeenCalledWith({
      url: wsUrl,
      room_id: roomId,
      slot_id: "m.call#ROOM",
      member: expectedMember,
    });
    // The url we connect the LiveKit room to must be the SFU websocket url, not
    // the JWT service url.
    expect(config).toEqual({
      jwt: testJWTToken,
      url: wsUrl,
      livekitAlias: roomId,
      livekitIdentity: "@me:example.org:ABCDEF",
    });
    expect(legacySpy).not.toHaveBeenCalled();
  });

  it("delegates the delayed leave event when a delay id is given", async () => {
    matrixClient._unstable_getLivekitToken.mockResolvedValue({
      jwt: testJWTToken,
    });

    await getSFUToken(matrixClient, ownMemberMock, serviceUrl, roomId, {
      wsUrl,
      forceJwtEndpoint: JwtEndpointVersion.Matrix_2_0,
      delayId: "delay_id",
    });

    expect(matrixClient._unstable_delegateDelayedLeave).toHaveBeenCalledWith({
      room_id: roomId,
      slot_id: "m.call#ROOM",
      member: expectedMember,
      delay_id: "delay_id",
    });
  });

  it("does not delegate without a delay id", async () => {
    matrixClient._unstable_getLivekitToken.mockResolvedValue({
      jwt: testJWTToken,
    });

    await getSFUToken(matrixClient, ownMemberMock, serviceUrl, roomId, {
      wsUrl,
      forceJwtEndpoint: JwtEndpointVersion.Matrix_2_0,
    });

    expect(matrixClient._unstable_delegateDelayedLeave).not.toHaveBeenCalled();
  });

  it("keeps the token if delegating the delayed leave event fails", async () => {
    matrixClient._unstable_getLivekitToken.mockResolvedValue({
      jwt: testJWTToken,
    });
    matrixClient._unstable_delegateDelayedLeave.mockRejectedValue(
      // The homeserver rejects delegation if the delay is shorter than an hour.
      new MatrixError({ errcode: "M_BAD_JSON", error: "Delay too short" }, 400),
    );

    const config = await getSFUToken(
      matrixClient,
      ownMemberMock,
      serviceUrl,
      roomId,
      {
        wsUrl,
        forceJwtEndpoint: JwtEndpointVersion.Matrix_2_0,
        delayId: "delay_id",
      },
    );

    expect(config.jwt).toBe(testJWTToken);
    expect(legacySpy).not.toHaveBeenCalled();
  });

  it.each([
    ["M_NOT_FOUND", 404],
    ["M_UNRECOGNIZED", 404],
  ])(
    "falls back to the legacy flow if the homeserver replies %s",
    async (errcode, httpStatus) => {
      matrixClient._unstable_getLivekitToken.mockRejectedValue(
        new MatrixError({ errcode, error: "Unknown endpoint" }, httpStatus),
      );

      const opts = {
        wsUrl,
        forceJwtEndpoint: JwtEndpointVersion.Matrix_2_0,
        delayId: "delay_id",
      };
      const config = await getSFUToken(
        matrixClient,
        ownMemberMock,
        serviceUrl,
        roomId,
        opts,
      );

      expect(config).toEqual(legacyConfig);
      expect(legacySpy).toHaveBeenCalledWith(
        matrixClient,
        ownMemberMock,
        serviceUrl,
        roomId,
        opts,
        undefined,
      );
    },
  );

  it("does not fall back if the CS-Api fails for another reason", async () => {
    const error = new MatrixError(
      { errcode: "M_FORBIDDEN", error: "Not joined to the room" },
      403,
    );
    matrixClient._unstable_getLivekitToken.mockRejectedValue(error);

    await expect(
      getSFUToken(matrixClient, ownMemberMock, serviceUrl, roomId, {
        wsUrl,
        forceJwtEndpoint: JwtEndpointVersion.Matrix_2_0,
      }),
    ).rejects.toBe(error);
    expect(legacySpy).not.toHaveBeenCalled();
  });

  it("does not try the CS-Api without a websocket url", async () => {
    await getSFUToken(matrixClient, ownMemberMock, serviceUrl, roomId, {
      forceJwtEndpoint: JwtEndpointVersion.Matrix_2_0,
    });

    expect(matrixClient._unstable_getLivekitToken).not.toHaveBeenCalled();
    expect(legacySpy).toHaveBeenCalled();
  });

  it.each([
    ["the legacy endpoint is forced", JwtEndpointVersion.Legacy],
    ["no endpoint version is given", undefined],
  ])("does not try the CS-Api if %s", async (_name, forceJwtEndpoint) => {
    await getSFUToken(matrixClient, ownMemberMock, serviceUrl, roomId, {
      wsUrl,
      forceJwtEndpoint,
    });

    expect(matrixClient._unstable_getLivekitToken).not.toHaveBeenCalled();
    expect(legacySpy).toHaveBeenCalled();
  });
});
