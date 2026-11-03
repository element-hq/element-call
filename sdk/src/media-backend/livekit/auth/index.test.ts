/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, type Mocked, vi } from "vitest";
import fetchMock from "fetch-mock";
import { MatrixError } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { NoMatrix2AuthorizationService } from "../../../errors";
import {
  aliceDeviceId,
  aliceUserId,
  createJWTToken,
} from "../../../utils/test-fixtures";
import type * as csApi from "./csApi";
import type * as openID from "./openID";
import { chooseAuthFlow, delegateDelayedLeave, getSFUConfig } from ".";

const aliceId = `${aliceUserId}:${aliceDeviceId}`;
const csApiJWTToken = createJWTToken(aliceId, "via CS API");
const legacyJWTToken = createJWTToken(aliceId, "via legacy endpoint");
const defaultJWTToken = createJWTToken(aliceId, "via default endpoint");

const client: Mocked<
  csApi.ClientGetTokenParts &
    csApi.ClientDelegationParts &
    openID.ClientOpenIDParts
> = {
  baseUrl: "https://matrix.example.org",
  _unstable_getLivekitToken: vi.fn().mockResolvedValue({ jwt: csApiJWTToken }),
  _unstable_delegateDelayedLeave: vi.fn().mockResolvedValue({}),
  getOpenIdToken: vi
    .fn()
    .mockResolvedValue({ access_token: "mock-openID-token" }),
};

const membership: CallMembershipIdentityParts = {
  userId: aliceUserId,
  deviceId: aliceDeviceId,
  memberId: "123",
};

const roomId = "!room:example.org";
const slotId = "m.call#ROOM";

const unsupportedError = new MatrixError({ errcode: "M_UNSUPPORTED" }, 404);

const urlTransport: UnstableLivekitTransport = {
  type: "livekit",
  url: "wss://livekit.example.org",
};

const serviceUrl = "https://livekit-jwt.example.org";
const serviceUrlTransport: UnstableLivekitTransport = {
  type: "livekit",
  livekit_service_url: serviceUrl,
};

const urlAndServiceUrlTransport: UnstableLivekitTransport = {
  ...urlTransport,
  ...serviceUrlTransport,
};

/** The JWT service, answering each endpoint with a token that names it. */
function mockJWTService(): void {
  fetchMock.post(`${serviceUrl}/sfu/get`, {
    status: 200,
    body: { url: "wss://sfu", jwt: legacyJWTToken },
  });
  fetchMock.post(`${serviceUrl}/get_token`, {
    status: 200,
    body: { url: "wss://sfu", jwt: defaultJWTToken },
  });
}

/** Whether the JWT service was asked at all, and which endpoint. */
function jwtServiceCalls(): string[] {
  return fetchMock.calls().map(([url]) => url.replace(serviceUrl, ""));
}

afterEach(() => {
  vi.clearAllMocks();
  fetchMock.reset();
});

describe("getSFUConfig", () => {
  const defaultParams = {
    client,
    membership,
    serverName: "example.org",
    role: "subscriber" as const,
    roomId,
    slotId,
    logger,
  };

  it("uses CS API with url transport", async () => {
    mockJWTService();
    expect(
      await getSFUConfig({ ...defaultParams, transport: urlTransport }),
    ).toEqual(
      expect.objectContaining({
        jwt: csApiJWTToken,
        livekitAlias: "via CS API",
      }),
    );
    expect(client._unstable_getLivekitToken).toHaveBeenCalledWith({
      url: urlTransport.url,
      server_name: "example.org",
      room_id: roomId,
      slot_id: slotId,
      member_id: "123",
    });
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("does not fall back to OpenID with url transport", async () => {
    mockJWTService();
    client._unstable_getLivekitToken.mockRejectedValueOnce(unsupportedError);
    await expect(
      getSFUConfig({ ...defaultParams, transport: urlTransport }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("uses OpenID with livekit_service_url transport", async () => {
    mockJWTService();
    expect(
      await getSFUConfig({ ...defaultParams, transport: serviceUrlTransport }),
    ).toEqual(
      expect.objectContaining({
        jwt: defaultJWTToken,
        livekitAlias: "via default endpoint",
      }),
    );
    expect(client._unstable_getLivekitToken).not.toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual(["/get_token"]);
  });

  it("uses OpenID when subscribing with url + livekit_service_url transport", async () => {
    mockJWTService();
    expect(
      await getSFUConfig({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
      }),
    ).toEqual(
      expect.objectContaining({
        jwt: defaultJWTToken,
        livekitAlias: "via default endpoint",
      }),
    );
    expect(client._unstable_getLivekitToken).not.toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual(["/get_token"]);
  });

  it("surfaces the widget host's refusal with url transport", async () => {
    mockJWTService();
    const error = new Error(
      "The rtc_livekit_get_token action is not supported by the client.",
    );
    client._unstable_getLivekitToken.mockRejectedValueOnce(error);
    await expect(
      getSFUConfig({ ...defaultParams, transport: urlTransport }),
    ).rejects.toThrow(error);
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("uses CS API when publishing with url transport", async () => {
    mockJWTService();
    expect(
      await getSFUConfig({
        ...defaultParams,
        transport: urlTransport,
        role: "publisher",
      }),
    ).toEqual(expect.objectContaining({ jwt: csApiJWTToken }));
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("does not fall back to OpenID when publishing with url transport", async () => {
    mockJWTService();
    client._unstable_getLivekitToken.mockRejectedValueOnce(unsupportedError);
    await expect(
      getSFUConfig({
        ...defaultParams,
        transport: urlTransport,
        role: "publisher",
      }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("uses the legacy OpenID endpoint when publishing with url + livekit_service_url transport", async () => {
    mockJWTService();
    // Subscribers predating MSC4195 expect a legacy participant identity from
    // anyone advertising a membership, which only the JWT service assigns
    expect(
      await getSFUConfig({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
        role: "publisher",
      }),
    ).toEqual(
      expect.objectContaining({
        jwt: legacyJWTToken,
        livekitAlias: "via legacy endpoint",
      }),
    );
    expect(client._unstable_getLivekitToken).not.toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual(["/sfu/get"]);
  });
});

describe("delegateDelayedLeave", () => {
  const defaultParams = {
    client,
    membership,
    roomId,
    slotId,
    delayId: "delay123",
    delayTimeoutMs: 3_600_000,
    logger,
  };

  /** The delay fields the JWT service was handed, if any. */
  function delegationViaJWTService(): object | undefined {
    const call = fetchMock.calls().find(([url]) => url.endsWith("/sfu/get"));
    if (call === undefined) return undefined;
    const { delay_id, delay_timeout, delay_cs_api_url } = JSON.parse(
      call[1]?.body as string,
    );
    return { delay_id, delay_timeout, delay_cs_api_url };
  }

  it("uses CS API with url transport", async () => {
    mockJWTService();
    await delegateDelayedLeave({ ...defaultParams, transport: urlTransport });
    expect(client._unstable_delegateDelayedLeave).toHaveBeenCalledWith({
      url: urlTransport.url,
      room_id: roomId,
      slot_id: slotId,
      member_id: "123",
      delay_id: "delay123",
    });
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("does not fall back to OpenID with url transport", async () => {
    mockJWTService();
    client._unstable_delegateDelayedLeave.mockRejectedValueOnce(
      unsupportedError,
    );
    await expect(
      delegateDelayedLeave({ ...defaultParams, transport: urlTransport }),
    ).rejects.toThrow();
    expect(client._unstable_delegateDelayedLeave).toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("uses OpenID with livekit_service_url transport", async () => {
    mockJWTService();
    await delegateDelayedLeave({
      ...defaultParams,
      transport: serviceUrlTransport,
    });
    expect(client._unstable_delegateDelayedLeave).not.toHaveBeenCalled();
    expect(delegationViaJWTService()).toEqual({
      delay_id: "delay123",
      delay_timeout: 3_600_000,
      delay_cs_api_url: client.baseUrl,
    });
  });

  it("uses OpenID with url + livekit_service_url transport", async () => {
    mockJWTService();
    // Must match the flow that got the token, so the identities line up
    await delegateDelayedLeave({
      ...defaultParams,
      transport: urlAndServiceUrlTransport,
    });
    expect(client._unstable_delegateDelayedLeave).not.toHaveBeenCalled();
    expect(delegationViaJWTService()).toEqual({
      delay_id: "delay123",
      delay_timeout: 3_600_000,
      delay_cs_api_url: client.baseUrl,
    });
  });
});

describe("chooseAuthFlow", () => {
  it.each([
    ["url", urlTransport, { kind: "csApi", url: urlTransport.url }],
    [
      "livekit_service_url",
      serviceUrlTransport,
      { kind: "openID", serviceUrl },
    ],
    [
      "url + livekit_service_url",
      urlAndServiceUrlTransport,
      { kind: "openID", serviceUrl },
    ],
  ] as const)(
    "chooses the flow for a %s transport as %s",
    (_shape, transport, flow) => {
      expect(chooseAuthFlow(transport)).toEqual(flow);
    },
  );
});
