/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Authentication with a LiveKit transport: the MSC4195 client-server API
 * through our homeserver for a transport with an SFU `url`, the OpenID flow
 * against the JWT service for one with a `livekit_service_url`, and the
 * choice between them where a transport carries both.
 */

import { ConnectionError, MatrixError } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { NoMatrix2AuthorizationService } from "../../../errors";
import * as csApi from "./csApi";
import * as openID from "./openID";
import { type ConnectionRole, type SFUConfig } from "./types";

export type { ClientOpenIDParts } from "./openID";
export type { ClientGetTokenParts, ClientDelegationParts } from "./csApi";
export type * from "./types";

/**
 * Whether an error means the homeserver does not implement the MSC4195
 * endpoints. The MSC says `M_NOT_FOUND`; a homeserver without support answers
 * with whatever it uses for unknown routes (Synapse: 404 with
 * `M_UNRECOGNIZED`), so any 404 counts.
 */
function isEndpointUnsupported(e: unknown): boolean {
  return (
    e instanceof MatrixError &&
    (e.httpStatus === 404 ||
      e.errcode === "M_NOT_FOUND" ||
      e.errcode === "M_UNRECOGNIZED")
  );
}

/**
 * Whether an error means the MSC4195 client-server API cannot be used from
 * here: the homeserver does not implement it, or the request never reached
 * the homeserver because a widget host does not expose the endpoint
 * (MSC4533), which the widget API reports as a plain error. A connection
 * error is neither: the endpoint may well exist.
 */
export function isCsApiUnavailable(e: unknown): boolean {
  if (isEndpointUnsupported(e)) return true;
  return !(e instanceof MatrixError) && !(e instanceof ConnectionError);
}

export interface GetSFUConfigParams {
  client: csApi.ClientGetTokenParts & openID.ClientOpenIDParts;
  membership: CallMembershipIdentityParts;
  transport: UnstableLivekitTransport;
  /** The homeserver the transport belongs to. */
  serverName: string;
  roomId: string;
  slotId: string;
  role: ConnectionRole;
  logger: Logger;
}

/**
 * Gets an {@link SFUConfig} appropriate for connecting to a given transport,
 * using whichever auth flow is appropriate.
 */
export async function getSFUConfig({
  client,
  membership,
  transport,
  serverName,
  roomId,
  slotId,
  role,
  logger,
}: GetSFUConfigParams): Promise<SFUConfig> {
  const flow = chooseAuthFlow(transport);
  if (flow.kind === "openID") {
    return await openID.getSFUConfig({
      client,
      membership,
      serviceUrl: flow.serviceUrl,
      roomId,
      slotId,
      role,
      logger,
    });
  } else {
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
      if (isEndpointUnsupported(e)) {
        logger.error(
          `Homeserver does not support the MSC4195 get_token endpoint, cannot get token for transport ${flow.url}`,
        );
        throw new NoMatrix2AuthorizationService(e as Error);
      }
      throw e;
    }
  }
}

export interface DelegateDelayedLeaveParams {
  client: csApi.ClientDelegationParts & openID.ClientOpenIDParts;
  membership: CallMembershipIdentityParts;
  /** The transport we publish on. */
  transport: UnstableLivekitTransport;
  roomId: string;
  slotId: string;
  delayId: string;
  /** How long the service waits before sending the leave, for the JWT service flow. */
  delayTimeoutMs: number;
  logger: Logger;
}

/**
 * Hands the delayed leave to the service that authenticated us as a
 * publisher, so that the identity it watches for on the SFU is the one we
 * publish under.
 */
export async function delegateDelayedLeave({
  client,
  membership,
  transport,
  roomId,
  slotId,
  delayId,
  delayTimeoutMs,
  logger,
}: DelegateDelayedLeaveParams): Promise<void> {
  const flow = chooseAuthFlow(transport);
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
    // The token this issues is discarded; the request is what hands the leave over
    await openID.getSFUConfig({
      client,
      membership,
      serviceUrl: flow.serviceUrl,
      roomId,
      slotId,
      role: "publisher",
      delayEndpointBaseUrl: client.baseUrl,
      delayId,
      delayTimeoutMs,
      logger,
    });
  }
}

/** The flow with which the local member authenticates against a transport. */
export type AuthFlow =
  | { kind: "csApi"; url: string }
  | { kind: "openID"; serviceUrl: string };

/**
 * Chooses which auth flow to use for a given transport. For now this returns a
 * single auth flow, with no provision for a fallback behavior.
 */
export function chooseAuthFlow(transport: UnstableLivekitTransport): AuthFlow {
  if ("url" in transport && !("livekit_service_url" in transport))
    return { kind: "csApi", url: transport.url };
  // All other transports use the OpenID flow, even if they contain a `url`.
  // This is necessary since the auth flow determines the participant identity
  // format, and we still have older clients out in the wild which would not yet
  // know to look for a hashed participant identity in case `url` is present in
  // someone else's transport.
  // TODO: Once users have updated their clients, choose the CS API flow if
  // available, keeping OpenID as a fallback.
  return { kind: "openID", serviceUrl: transport.livekit_service_url };
}
