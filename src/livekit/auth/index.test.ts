/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, type Mocked, vi, describe, it } from "vitest";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  aliceDeviceId,
  aliceId,
  aliceUserId,
  createJWTToken,
} from "../../utils/test-fixtures";
import type * as csApi from "./csApi";
import * as openID from "./openID";
import { delegateDelayedLeave, getSFUConfig } from ".";
import { mocked } from "storybook/test";
import { ConnectionError, MatrixError } from "matrix-js-sdk";
import { NoMatrix2AuthorizationService } from "../../utils/errors";
import { MatrixRTCMode } from "../../config/ConfigOptions";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

vi.mock("./openID", () => ({ getSFUConfig: vi.fn() }));
vi.useFakeTimers();

const csApiJWTToken = createJWTToken(aliceId, "via CS API");
const openIDJWTToken = createJWTToken(aliceId, "via OpenID");

mocked(openID).getSFUConfig.mockResolvedValue({
  url: "mock-openID-url",
  jwt: openIDJWTToken,
  livekitAlias: "via OpenID",
  livekitIdentity: aliceId,
});

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

const serviceUrlTransport: UnstableLivekitTransport = {
  type: "livekit",
  livekit_service_url: "https://livekit-jwt.example.org",
};

const urlAndServiceUrlTransport: UnstableLivekitTransport = {
  ...urlTransport,
  ...serviceUrlTransport,
};

afterEach(() => vi.clearAllMocks());

describe("getSFUConfig", () => {
  const defaultParams = {
    client,
    membership,
    serverName: "example.org",
    role: "subscriber" as const,
    matrixRTCMode: MatrixRTCMode.Matrix_2_0,
    roomId,
    slotId,
    logger,
  };

  it("uses CS API with url transport", async () => {
    expect(
      await getSFUConfig({ ...defaultParams, transport: urlTransport }),
    ).toEqual(
      expect.objectContaining({
        jwt: csApiJWTToken,
        livekitAlias: "via CS API",
      }),
    );
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });

  it("does not fall back to OpenID with url transport", async () => {
    client._unstable_getLivekitToken.mockRejectedValueOnce(unsupportedError);
    await expect(
      getSFUConfig({ ...defaultParams, transport: urlTransport }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });

  it("uses OpenID with livekit_service_url transport", async () => {
    expect(
      await getSFUConfig({ ...defaultParams, transport: serviceUrlTransport }),
    ).toEqual(
      expect.objectContaining({
        jwt: openIDJWTToken,
        livekitAlias: "via OpenID",
      }),
    );
    expect(client._unstable_getLivekitToken).not.toHaveBeenCalled();
    expect(openID.getSFUConfig).toHaveBeenCalled();
  });

  it("uses CS API with url + livekit_service_url transport", async () => {
    expect(
      await getSFUConfig({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
      }),
    ).toEqual(
      expect.objectContaining({
        jwt: csApiJWTToken,
        livekitAlias: "via CS API",
      }),
    );
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });

  it("falls back to OpenID with url + livekit_service_url transport", async () => {
    client._unstable_getLivekitToken.mockRejectedValueOnce(unsupportedError);
    expect(
      await getSFUConfig({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
      }),
    ).toEqual(
      expect.objectContaining({
        jwt: openIDJWTToken,
        livekitAlias: "via OpenID",
      }),
    );
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(openID.getSFUConfig).toHaveBeenCalled();
  });

  it("does not fall back to OpenID when publishing", async () => {
    client._unstable_getLivekitToken.mockRejectedValueOnce(unsupportedError);
    await expect(
      getSFUConfig({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
        role: "publisher",
      }),
    ).rejects.toThrow(expect.any(NoMatrix2AuthorizationService));
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });

  it("uses OpenID when publishing in compatibility mode with url + livekit_service_url transport", async () => {
    // Subscribers predating MSC4195 expect a legacy participant identity from
    // anyone advertising a state event, which only the JWT service assigns
    expect(
      await getSFUConfig({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
        role: "publisher",
        matrixRTCMode: MatrixRTCMode.Compatibility,
      }),
    ).toEqual(
      expect.objectContaining({
        jwt: openIDJWTToken,
        livekitAlias: "via OpenID",
      }),
    );
    expect(client._unstable_getLivekitToken).not.toHaveBeenCalled();
    expect(openID.getSFUConfig).toHaveBeenCalledWith(
      expect.objectContaining({ role: "publisher" }),
    );
  });

  it("uses CS API when publishing in compatibility mode with url transport", async () => {
    expect(
      await getSFUConfig({
        ...defaultParams,
        transport: urlTransport,
        role: "publisher",
        matrixRTCMode: MatrixRTCMode.Compatibility,
      }),
    ).toEqual(expect.objectContaining({ jwt: csApiJWTToken }));
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });

  it("uses CS API when subscribing in compatibility mode with url + livekit_service_url transport", async () => {
    expect(
      await getSFUConfig({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
        matrixRTCMode: MatrixRTCMode.Compatibility,
      }),
    ).toEqual(expect.objectContaining({ jwt: csApiJWTToken }));
    expect(client._unstable_getLivekitToken).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });

  it("does not fall back to OpenID on connection error", async () => {
    const client_ = {
      ...client,
      _unstable_getLivekitToken: vi
        .fn()
        .mockRejectedValue(new ConnectionError("No connection")),
    };
    await Promise.all([
      expect(
        getSFUConfig({
          ...defaultParams,
          client: client_,
          transport: urlAndServiceUrlTransport,
        }),
      ).rejects.toThrow(expect.any(ConnectionError)),
      vi.runAllTimersAsync(), // Allow request to be retried
    ]);
    expect(client_._unstable_getLivekitToken).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });
});

describe("delegateDelayedLeave", () => {
  const defaultParams = {
    client,
    membership,
    roomId,
    slotId,
    delayId: "delay123",
    matrixRTCMode: MatrixRTCMode.Matrix_2_0,
    logger,
  };

  it("uses CS API with url transport", async () => {
    await delegateDelayedLeave({ ...defaultParams, transport: urlTransport });
    expect(client._unstable_delegateDelayedLeave).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });

  it("does not fall back to OpenID with url transport", async () => {
    client._unstable_delegateDelayedLeave.mockRejectedValueOnce(
      unsupportedError,
    );
    await expect(
      delegateDelayedLeave({ ...defaultParams, transport: urlTransport }),
    ).rejects.toThrow();
    expect(client._unstable_delegateDelayedLeave).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });

  it("uses OpenID with livekit_service_url transport", async () => {
    await delegateDelayedLeave({
      ...defaultParams,
      transport: serviceUrlTransport,
    });
    expect(client._unstable_delegateDelayedLeave).not.toHaveBeenCalled();
    expect(openID.getSFUConfig).toHaveBeenCalled();
  });

  it("uses CS API with url + livekit_service_url transport", async () => {
    await delegateDelayedLeave({
      ...defaultParams,
      transport: urlAndServiceUrlTransport,
    });
    expect(client._unstable_delegateDelayedLeave).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });

  it("uses OpenID in compatibility mode with url + livekit_service_url transport", async () => {
    // Must match the flow that got the token, so the identities line up
    await delegateDelayedLeave({
      ...defaultParams,
      transport: urlAndServiceUrlTransport,
      matrixRTCMode: MatrixRTCMode.Compatibility,
    });
    expect(client._unstable_delegateDelayedLeave).not.toHaveBeenCalled();
    expect(openID.getSFUConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "publisher",
        delayId: "delay123",
        delayEndpointBaseUrl: client.baseUrl,
      }),
    );
  });

  it("does not fall back to OpenID with url + livekit_service_url transport", async () => {
    client._unstable_delegateDelayedLeave.mockRejectedValueOnce(
      unsupportedError,
    );
    await expect(
      delegateDelayedLeave({
        ...defaultParams,
        transport: urlAndServiceUrlTransport,
      }),
    ).rejects.toThrow();
    expect(client._unstable_delegateDelayedLeave).toHaveBeenCalled();
    expect(openID.getSFUConfig).not.toHaveBeenCalled();
  });
});
