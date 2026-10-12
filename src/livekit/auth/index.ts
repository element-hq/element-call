/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { MatrixError } from "matrix-js-sdk";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import * as openID from "./openID";
import * as csApi from "./csApi";
import { type SFUConfig } from "./types";
import { NoMatrix2AuthorizationService } from "../../utils/errors";
import { MatrixRTCMode } from "../../config/ConfigOptions";

export type { ClientOpenIDParts } from "./openID";
export type { ClientGetTokenParts, ClientDelegationParts } from "./csApi";
export type * from "./types";

/**
 * Checks whether an error means "this homeserver does not implement the
 * (unstable) MSC4195 endpoints".
 *
 * MSC4195 documents `M_NOT_FOUND` for this, but a homeserver without support
 * answers with whatever it uses for unknown endpoints (Synapse: 404 with
 * `M_UNRECOGNIZED`), so we accept any 404 as "unsupported".
 * @param e The error to check.
 */
function isEndpointUnsupported(e: unknown): boolean {
  return (
    e instanceof MatrixError &&
    (e.httpStatus === 404 ||
      e.errcode === "M_NOT_FOUND" ||
      e.errcode === "M_UNRECOGNIZED")
  );
}

export interface GetSFUConfigParams {
  /**
   * The Matrix client.
   */
  client: csApi.ClientGetTokenParts & openID.ClientOpenIDParts;
  /**
   * Data identifying the local user's session membership.
   */
  membership: CallMembershipIdentityParts;
  /**
   * The transport for which we wish to get an access token.
   */
  transport: UnstableLivekitTransport;
  /**
   * The name of the homeserver to which the {@link transport} belongs.
   */
  serverName: string;
  /**
   * The ID of the Matrix room in which the session takes place.
   */
  roomId: string;
  /**
   * The ID of the MatrixRTC slot in which the session takes place.
   */
  slotId: string;
  /**
   * Whether we want to publish or only subscribe on the {@link transport}.
   */
  role: "publisher" | "subscriber";
  /**
   * The MatrixRTC mode, which decides the format of our membership event and
   * so the participant identity a publisher must have.
   */
  matrixRTCMode: MatrixRTCMode;
  logger: Logger;
}

/**
 * Gets an {@link SFUConfig} appropriate for connecting to a given transport.
 */
export async function getSFUConfig({
  client,
  membership,
  transport,
  serverName,
  roomId,
  slotId,
  role,
  matrixRTCMode,
  logger,
}: GetSFUConfigParams): Promise<SFUConfig> {
  const viaOpenID = async (serviceUrl: string): Promise<SFUConfig> =>
    await openID.getSFUConfig({
      client,
      membership,
      serviceUrl,
      roomId,
      slotId,
      role,
      logger,
    });

  const flow = chooseAuthFlow(transport, role, matrixRTCMode);
  if (flow.kind === "openID") return await viaOpenID(flow.serviceUrl);

  try {
    return await csApi.getSFUConfig({
      client,
      membership,
      url: flow.url,
      serverName,
      roomId,
      slotId,
    });
  } catch (e) {
    if (!isEndpointUnsupported(e)) throw e;
    // Publishers should never fall back. If a homeserver advertises a `url`
    // but doesn't support MSC4195 itself, that's a misconfiguration which
    // the admin should know about so they can prepare for the future
    // deprecation of `livekit_service_url`.
    const mayFallBack =
      role === "subscriber" && "livekit_service_url" in transport;
    if (!mayFallBack) {
      logger.error(
        `Homeserver does not support the MSC4195 get_token endpoint, cannot get token for transport ${flow.url}`,
      );
      throw new NoMatrix2AuthorizationService(e as Error);
    }
    logger.warn(
      `Homeserver does not support the MSC4195 get_token endpoint, falling back to the OpenID flow with service ${transport.livekit_service_url}`,
    );
    return await viaOpenID(transport.livekit_service_url);
  }
}

export interface DelegateDelayedLeaveParams {
  /**
   * The Matrix client.
   */
  client: csApi.ClientDelegationParts & openID.ClientOpenIDParts;
  /**
   * Data identifying the local user's session membership.
   */
  membership: CallMembershipIdentityParts;
  /**
   * The transport to which we are publishing and wish to delegate the delayed
   * leave event.
   */
  transport: UnstableLivekitTransport;
  /**
   * The ID of the Matrix room in which the session takes place.
   */
  roomId: string;
  /**
   * The ID of the MatrixRTC slot in which the session takes place.
   */
  slotId: string;
  /**
   * The delay ID of the leave event to be delegated.
   */
  delayId: string;
  /**
   * The MatrixRTC mode, which decides the format of our membership event.
   */
  matrixRTCMode: MatrixRTCMode;
  logger: Logger;
}

/**
 * Delegates a delayed leave event to a given transport, so that the event will
 * be sent on our behalf whenever we disconnect from the transport's SFU.
 */
export async function delegateDelayedLeave({
  client,
  membership,
  transport,
  roomId,
  slotId,
  delayId,
  matrixRTCMode,
  logger,
}: DelegateDelayedLeaveParams): Promise<void> {
  // It's important that we use the same flow (CS API or OpenID) as whatever we
  // would've used to get a JWT token for this transport, since the participant
  // identity computed by the service needs to match.
  const flow = chooseAuthFlow(transport, "publisher", matrixRTCMode);
  if (flow.kind === "csApi") {
    try {
      await csApi.delegateDelayedLeave({
        client,
        membership,
        url: flow.url,
        roomId,
        slotId,
        delayId,
      });
    } catch (e) {
      if (isEndpointUnsupported(e))
        logger.error(
          "Server misconfigured: transport contains a 'url' field but server does not support the MSC4195 delegate_delayed_leave endpoint",
        );
      throw e;
    }
  } else {
    // This will technically cause the service to issue a new JWT token, but
    // it's safe to discard. We're only interested in triggering delegation.
    await openID.getSFUConfig({
      client,
      membership,
      serviceUrl: flow.serviceUrl,
      roomId,
      slotId,
      role: "publisher",
      delayEndpointBaseUrl: client.baseUrl,
      delayId,
      logger,
    });
  }
}

/**
 * The flow with which the local member authenticates against a transport.
 */
export type AuthFlow =
  | { kind: "csApi"; url: string }
  | { kind: "openID"; serviceUrl: string };

/**
 * Chooses between the MSC4195 CS API and the legacy OpenID flow against the
 * transport's JWT service.
 *
 * Only the JWT service's `/sfu/get` endpoint assigns the legacy participant
 * identity that clients predating MSC4195 expect from anyone advertising a
 * membership state event, which is what compatibility mode sends. So a
 * publisher in compatibility mode keeps using the JWT service wherever the
 * transport still offers one, even if it also has a `url`. Subscribers may use
 * the CS API regardless, as nobody matches their identity.
 * @param transport The transport to authenticate against.
 * @param role Whether we want to publish or only subscribe on the transport.
 * @param matrixRTCMode The MatrixRTC mode, which decides the format of our
 *   membership event.
 */
export function chooseAuthFlow(
  transport: UnstableLivekitTransport,
  role: "publisher" | "subscriber",
  matrixRTCMode: MatrixRTCMode,
): AuthFlow {
  if ("url" in transport) {
    const useCsApi =
      !("livekit_service_url" in transport) ||
      role === "subscriber" ||
      matrixRTCMode === MatrixRTCMode.Matrix_2_0;
    if (useCsApi) return { kind: "csApi", url: transport.url };
  }
  return { kind: "openID", serviceUrl: transport.livekit_service_url };
}
