/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Authentication with a LiveKit transport.
 */

import { MatrixError } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { BehaviorSubject } from "rxjs";

import { NoMatrix2AuthorizationService } from "../../../errors";
import { type Behavior } from "../../../reactive/Behavior";
import * as csApi from "./csApi";
import * as openID from "./openID";
import { type ConnectionRole, type SFUConfig } from "./types";

export type { ClientOpenIDParts } from "./openID";
export type { ClientGetTokenParts, ClientDelegationParts } from "./csApi";
export type * from "./types";

/**
 * Whether an error means the homeserver does not implement the MSC4195
 * endpoints. Such a homeserver answers with whatever it uses for unknown
 * routes (Synapse: 404 with `M_UNRECOGNIZED`), so any 404 counts.
 */
export function isCsApiUnavailable(e: unknown): boolean {
  const answer = unwrapErrorDetails(e);
  return (
    answer !== undefined &&
    (answer.status === 404 ||
      answer.errcode === "M_NOT_FOUND" ||
      answer.errcode === "M_UNRECOGNIZED")
  );
}

/**
 * Tries to unwrap the details from an unknown error object, regardless of whether
 * it came from the Widget API or not.
 */
function unwrapErrorDetails(
  e: unknown,
): { status?: number; errcode?: string } | undefined {
  // If the error is an instance of `MatrixError`, take its details directly.
  if (e instanceof MatrixError) {
    return { status: e.httpStatus, errcode: e.errcode };
  }

  // If the error originated from the widget API, try to extract the bundled
  // Matrix API error. We identify the widget's `WidgetApiResponseError` by
  // the shape of its payload to avoid making the SDK dependent on the widget
  // API. This isn't great, but we'll drop this branch anyway once we eliminate
  // usage.
  if (e instanceof Error && "data" in e) {
    const relayed = (
      e as {
        data?: {
          matrix_api_error?: {
            http_status?: unknown;
            response?: { errcode?: unknown };
          };
        };
      }
    ).data?.matrix_api_error;
    if (typeof relayed === "object" && relayed !== null) {
      const { http_status: status, response } = relayed;
      const errcode = response?.errcode;
      return {
        status: typeof status === "number" ? status : undefined,
        errcode: typeof errcode === "string" ? errcode : undefined,
      };
    }
  }

  // We're not able to extract any details from this error.
  return undefined;
}

/**
 * Tracks whether the MSC4195 client-server API can be used from within a
 * session. The MSC defines no unstable feature flag, so this property needs
 * to be inferred from the first authentication response.
 */
export class CsApiSupport {
  private readonly _usable$ = new BehaviorSubject(true);

  /** False once the API has been found missing. True while still unknown. */
  public readonly usable$: Behavior<boolean> = this._usable$;

  /** False once the API has been found missing. True while still unknown. */
  public get usable(): boolean {
    return this._usable$.value;
  }

  /** Records that a request found the API missing. */
  public ruleOut(): void {
    if (this._usable$.value) this._usable$.next(false);
  }
}

export interface GetSFUConfigParams {
  client: csApi.ClientGetTokenParts & openID.ClientOpenIDParts;
  /** The session's knowledge of whether the client-server API is usable. */
  csApiSupport: CsApiSupport;
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
 *
 * When the client-server API flow is chosen but the API is found missing, usage
 * of it is ruled out for this session on the supplied {@link CsApiSupport}. The
 * caller is responsible for falling back to the OpenID flow in this case by calling
 * this method again.
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
  csApiSupport,
}: GetSFUConfigParams): Promise<SFUConfig> {
  const flow = chooseAuthFlow(transport, csApiSupport.usable);
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
      if (isCsApiUnavailable(e)) {
        logger.warn(
          `Homeserver does not support the MSC4195 get_token endpoint, cannot get token for transport ${flow.url}`,
        );
        // Rule out usage of the CS API for this session. Note that, as per MSC4195,
        // only 403 / M_FORBIDDEN and 400 / M_INVALID_PARAM are forwarded from the
        // remote server. Any other remote error becomes 502 / M_UNKNOWN on the client-
        // server API.
        csApiSupport.ruleOut();
        throw new NoMatrix2AuthorizationService(e as Error);
      }
      throw e;
    }
  }
}

export type AuthenticateWithTransportParams = Omit<
  GetSFUConfigParams,
  "csApiSupport"
>;

/**
 * Authenticates with a transport once, outside any session. This automatically
 * falls back from the client-server API flow to the OpenID flow if needed and
 * possible.
 *
 * @throws {@link NoMatrix2AuthorizationService} if the client-server API is missing
 * but the transport does not allow falling back to the OpenID flow.
 */
export async function authenticateWithTransport(
  params: AuthenticateWithTransportParams,
): Promise<SFUConfig> {
  const csApiSupport = new CsApiSupport();
  try {
    return await getSFUConfig({ ...params, csApiSupport });
  } catch (e) {
    // Nothing else to try unless the failure changed which flow is chosen
    if (
      csApiSupport.usable ||
      chooseAuthFlow(params.transport, false).kind !== "openID"
    )
      throw e;
    return await getSFUConfig({ ...params, csApiSupport });
  }
}

export interface DelegateDelayedLeaveParams {
  client: csApi.ClientDelegationParts & openID.ClientOpenIDParts;
  /** The session's knowledge of whether the client-server API is usable. */
  csApiSupport: CsApiSupport;
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
  csApiSupport,
}: DelegateDelayedLeaveParams): Promise<void> {
  const flow = chooseAuthFlow(transport, csApiSupport.usable);
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
      if (isCsApiUnavailable(e))
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
 * Chooses which auth flow to use for a given transport.
 */
export function chooseAuthFlow(
  transport: UnstableLivekitTransport,
  csApiUsable: boolean,
): AuthFlow {
  // If we only have url, we have no choice but to use the CS API.
  if ("url" in transport && !("livekit_service_url" in transport))
    return { kind: "csApi", url: transport.url };

  // If we have both url and livekit_service_url, prefer the CS API if it is usable.
  if ("url" in transport && csApiUsable)
    return { kind: "csApi", url: transport.url };

  // If the CS API is not usable or we only have livekit_service_url, fall back
  // to using the OpenID flow.
  return { kind: "openID", serviceUrl: transport.livekit_service_url };
}
