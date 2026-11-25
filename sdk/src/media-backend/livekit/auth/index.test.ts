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
  type Mocked,
  vi,
} from "vitest";
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
import {
  authenticateWithTransport,
  chooseAuthFlow,
  CsApiSupport,
  delegateDelayedLeave,
  getSFUConfig,
} from ".";

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
  getLivekitToken: vi.fn().mockResolvedValue({ jwt: csApiJWTToken }),
  delegateDelayedLeave: vi.fn().mockResolvedValue({}),
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

/** The session's state. Fresh for every test. */
let csApiSupport: CsApiSupport;
beforeEach(() => {
  csApiSupport = new CsApiSupport();
});

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
    get csApiSupport(): CsApiSupport {
      return csApiSupport;
    },
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
    expect(client.getLivekitToken).toHaveBeenCalledWith({
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
    client.getLivekitToken.mockRejectedValueOnce(unsupportedError);
    await expect(
      getSFUConfig({ ...defaultParams, transport: urlTransport }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(client.getLivekitToken).toHaveBeenCalled();
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
    expect(client.getLivekitToken).not.toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual(["/get_token"]);
  });

  it.each(["subscriber", "publisher"] as const)(
    "prefers CS API as %s with url + livekit_service_url transport",
    async (role) => {
      mockJWTService();
      expect(
        await getSFUConfig({
          ...defaultParams,
          transport: urlAndServiceUrlTransport,
          role,
        }),
      ).toEqual(
        expect.objectContaining({
          jwt: csApiJWTToken,
          livekitAlias: "via CS API",
        }),
      );
      expect(client.getLivekitToken).toHaveBeenCalled();
      expect(jwtServiceCalls()).toEqual([]);
      expect(csApiSupport.usable).toBe(true);
    },
  );

  it("rules the CS API out and fails with url + livekit_service_url transport where the homeserver lacks the endpoint", async () => {
    mockJWTService();
    client.getLivekitToken.mockRejectedValueOnce(unsupportedError);
    await expect(
      getSFUConfig({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
      }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(jwtServiceCalls()).toEqual([]);
    expect(csApiSupport.usable).toBe(false);
  });

  it("goes straight to OpenID once the CS API has been found missing", async () => {
    mockJWTService();
    client.getLivekitToken.mockRejectedValueOnce(unsupportedError);
    await expect(
      getSFUConfig({ ...defaultParams, transport: urlTransport }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    client.getLivekitToken.mockClear();

    await getSFUConfig({
      ...defaultParams,
      transport: urlAndServiceUrlTransport,
    });
    expect(client.getLivekitToken).not.toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual(["/get_token"]);
  });

  it("does not rule the CS API out where the homeserver refuses the request", async () => {
    mockJWTService();
    const forbidden = new MatrixError({ errcode: "M_FORBIDDEN" }, 403);
    client.getLivekitToken.mockRejectedValueOnce(forbidden);
    await expect(
      getSFUConfig({ ...defaultParams, transport: urlAndServiceUrlTransport }),
    ).rejects.toThrow(forbidden);
    expect(jwtServiceCalls()).toEqual([]);
    expect(csApiSupport.usable).toBe(true);
  });

  it("rules the CS API out for another homeserver's transport", async () => {
    mockJWTService();
    client.getLivekitToken.mockRejectedValueOnce(
      new MatrixError({ errcode: "M_UNRECOGNIZED" }, 404),
    );
    await expect(
      getSFUConfig({
        ...defaultParams,
        serverName: "elsewhere.org",
        transport: urlAndServiceUrlTransport,
      }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(jwtServiceCalls()).toEqual([]);
    expect(csApiSupport.usable).toBe(false);
  });

  it("rules the CS API out where a widget host relays the homeserver's not found", async () => {
    mockJWTService();
    // The widget API's WidgetApiResponseError arrives in a minified build.
    const relayed = Object.assign(new Error("Unrecognized request"), {
      name: "n",
      data: {
        matrix_api_error: {
          http_status: 404,
          response: { errcode: "M_UNRECOGNIZED" },
        },
      },
    });
    client.getLivekitToken.mockRejectedValueOnce(relayed);
    await expect(
      getSFUConfig({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
      }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(jwtServiceCalls()).toEqual([]);
    expect(csApiSupport.usable).toBe(false);
  });

  it.each([
    ["a token that does not decode", { jwt: "not a token" }],
    ["an error of our own", new TypeError("oops")],
  ])("does not judge the CS API by %s", async (_what, outcome) => {
    mockJWTService();
    if (outcome instanceof Error)
      client.getLivekitToken.mockRejectedValueOnce(outcome);
    else client.getLivekitToken.mockResolvedValueOnce(outcome);
    await expect(
      getSFUConfig({ ...defaultParams, transport: urlAndServiceUrlTransport }),
    ).rejects.toThrow();
    expect(jwtServiceCalls()).toEqual([]);
    expect(csApiSupport.usable).toBe(true);
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
    expect(client.getLivekitToken).toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("does not fall back to OpenID when publishing with url transport", async () => {
    mockJWTService();
    client.getLivekitToken.mockRejectedValueOnce(unsupportedError);
    await expect(
      getSFUConfig({
        ...defaultParams,
        transport: urlTransport,
        role: "publisher",
      }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(client.getLivekitToken).toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual([]);
  });
});

describe("authenticateWithTransport", () => {
  const defaultParams = {
    client,
    membership,
    serverName: "example.org",
    role: "subscriber" as const,
    roomId,
    slotId,
    logger,
  };

  it("uses CS API with url + livekit_service_url transport", async () => {
    mockJWTService();
    expect(
      await authenticateWithTransport({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
      }),
    ).toEqual(expect.objectContaining({ jwt: csApiJWTToken }));
    expect(jwtServiceCalls()).toEqual([]);
  });

  it.each([
    ["subscriber", "/get_token", defaultJWTToken],
    ["publisher", "/sfu/get", legacyJWTToken],
  ] as const)(
    "falls back to OpenID as %s where the homeserver lacks the endpoint",
    async (role, endpoint, jwt) => {
      mockJWTService();
      client.getLivekitToken.mockRejectedValueOnce(unsupportedError);
      expect(
        await authenticateWithTransport({
          ...defaultParams,
          transport: urlAndServiceUrlTransport,
          role,
        }),
      ).toEqual(expect.objectContaining({ jwt }));
      expect(client.getLivekitToken).toHaveBeenCalledTimes(1);
      expect(jwtServiceCalls()).toEqual([endpoint]);
    },
  );

  it("does not fall back with url transport", async () => {
    mockJWTService();
    client.getLivekitToken.mockRejectedValueOnce(unsupportedError);
    await expect(
      authenticateWithTransport({ ...defaultParams, transport: urlTransport }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(client.getLivekitToken).toHaveBeenCalledTimes(1);
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("does not fall back where the homeserver refuses the request", async () => {
    mockJWTService();
    const forbidden = new MatrixError({ errcode: "M_FORBIDDEN" }, 403);
    client.getLivekitToken.mockRejectedValueOnce(forbidden);
    await expect(
      authenticateWithTransport({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
      }),
    ).rejects.toThrow(forbidden);
    expect(jwtServiceCalls()).toEqual([]);
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
    get csApiSupport(): CsApiSupport {
      return csApiSupport;
    },
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
    expect(client.delegateDelayedLeave).toHaveBeenCalledWith({
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
    client.delegateDelayedLeave.mockRejectedValueOnce(unsupportedError);
    await expect(
      delegateDelayedLeave({ ...defaultParams, transport: urlTransport }),
    ).rejects.toThrow();
    expect(client.delegateDelayedLeave).toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("uses OpenID with livekit_service_url transport", async () => {
    mockJWTService();
    await delegateDelayedLeave({
      ...defaultParams,
      transport: serviceUrlTransport,
    });
    expect(client.delegateDelayedLeave).not.toHaveBeenCalled();
    expect(delegationViaJWTService()).toEqual({
      delay_id: "delay123",
      delay_timeout: 3_600_000,
      delay_cs_api_url: client.baseUrl,
    });
  });

  it("uses CS API with url + livekit_service_url transport", async () => {
    mockJWTService();
    await delegateDelayedLeave({
      ...defaultParams,
      transport: urlAndServiceUrlTransport,
    });
    expect(client.delegateDelayedLeave).toHaveBeenCalled();
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("does not fall back to OpenID with url + livekit_service_url transport", async () => {
    mockJWTService();
    client.delegateDelayedLeave.mockRejectedValueOnce(unsupportedError);
    await expect(
      delegateDelayedLeave({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
      }),
    ).rejects.toThrow();
    expect(jwtServiceCalls()).toEqual([]);
  });

  it("uses OpenID with url + livekit_service_url transport when the token came from there", async () => {
    mockJWTService();
    // Must match the flow that got the token, so the identities line up
    csApiSupport.ruleOut();
    await delegateDelayedLeave({
      ...defaultParams,
      transport: urlAndServiceUrlTransport,
    });
    expect(client.delegateDelayedLeave).not.toHaveBeenCalled();
    expect(delegationViaJWTService()).toEqual({
      delay_id: "delay123",
      delay_timeout: 3_600_000,
      delay_cs_api_url: client.baseUrl,
    });
  });
});

describe("chooseAuthFlow", () => {
  const viaCsApi = { kind: "csApi", url: urlTransport.url };
  const viaOpenID = { kind: "openID", serviceUrl };
  it.each([
    ["url", urlTransport, true, viaCsApi],
    ["url", urlTransport, false, viaCsApi],
    ["livekit_service_url", serviceUrlTransport, true, viaOpenID],
    ["livekit_service_url", serviceUrlTransport, false, viaOpenID],
    ["url + livekit_service_url", urlAndServiceUrlTransport, true, viaCsApi],
    ["url + livekit_service_url", urlAndServiceUrlTransport, false, viaOpenID],
  ] as const)(
    "chooses the flow for a %s transport with the CS API usable: %s",
    (_shape, transport, csApiUsable, flow) => {
      expect(chooseAuthFlow(transport, csApiUsable)).toEqual(flow);
    },
  );
});

describe("CsApiSupport", () => {
  it("counts the API as usable until it is found missing", () => {
    expect(csApiSupport.usable).toBe(true);
    csApiSupport.ruleOut();
    expect(csApiSupport.usable).toBe(false);
    expect(csApiSupport.usable$.value).toBe(false);
  });

  it("reports the change once however often the API is found missing", () => {
    const seen: boolean[] = [];
    csApiSupport.usable$.subscribe((usable) => seen.push(usable));
    csApiSupport.ruleOut();
    csApiSupport.ruleOut();
    expect(seen).toEqual([true, false]);
  });
});
