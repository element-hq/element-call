/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { MatrixError } from "matrix-js-sdk";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { type LivekitRtcMember } from "matrix-js-sdk/lib/matrixrtc";
import { type Logger } from "matrix-js-sdk/lib/logger";

import {
  getSFUConfigLegacyWithOpenID,
  type OpenIDClientParts,
} from "./openIDSFULegacy.ts";
import { extractFullConfigFromToken, type SFUConfig } from "./SFUConfig.ts";
import { JwtEndpointVersion } from "../state/CallViewModel/localMember/LocalTransport.ts";
import { doNetworkOperationWithRetry } from "../utils/matrix.ts";

// TODO: This should come from the `MatrixRTCSession`s slot description instead
// of being hardcoded here. (the legacy flow hardcodes it as well)
const SLOT_ID = "m.call#ROOM";

/**
 * Authenticates with the matrix RTC backend (SFU) and, if possible, hands the
 * management of our delayed leave event over to the homeserver.
 *
 * Two flows exist:
 *  - The CS-Api based flow (MSC4195): the homeserver authenticates us with the
 *    SFU. This requires matrix 2.0 (sticky events) and homeserver support.
 *  - The legacy flow: we get an openID token from the homeserver and hand it to
 *    the JWT service sitting next to the SFU. See {@link getSFUConfigLegacyWithOpenID}.
 *
 * We only try the CS-Api flow if we are in matrix 2.0 mode and know the SFU
 * websocket url. If the homeserver does not implement the (unstable) MSC4195
 * endpoints we fall back to the legacy flow.
 * @param client The Matrix client
 * @param membership Our own membership identity parts, used to identify the
 * `m.rtc.member` event we want a token for.
 * @param serviceUrl The URL of the JWT service next to the livekit SFU. Only used by the legacy flow.
 * @param roomId The room id used in the token request. This is NOT the livekit_alias.
 * The livekit alias is provided as part of the JWT payload.
 * @param opts Additional options to modify which endpoint with which data will be used to acquire the jwt token.
 * @param opts.wsUrl The websocket URL of the livekit SFU. Comes from the transport
 * (either from the `/transports` endpoint or from a remote member's transport field).
 * The CS-Api flow cannot be used without it, since the homeserver needs to be
 * told which of its SFUs to get a token from.
 * @param opts.forceJwtEndpoint Which endpoint version to use.
 * {@link JwtEndpointVersion.Matrix_2_0} is what enables the CS-Api flow: we can
 * only use the hashed rtc backend identity if we also send the new matrix 2.0
 * sticky events. For remote connections this does not matter, since we do not
 * publish there, so `undefined` (try whatever the JWT service supports) is used.
 * @param opts.delayEndpointBaseUrl The URL of the matrix homeserver. Only used
 * by the legacy flow: the homeserver knows its own CS-Api url.
 * @param opts.delayId The delay id of the delayed leave event to delegate.
 * @param logger optional logger.
 * @returns Object containing the token information
 * @throws FailToGetOpenIdToken | NoMatrix2AuthorizationService | MatrixError
 */
 // TODO multiple participatns on remote sfu with different transports
 // {livekit_service_url: http://}
 // {url: ws://, livekit_service_url: http://}
 // conclusion?: connect with newest stack (wsUrl + cs-api). Should end up on same sfu only subscribe, hence own identity does not matter
export async function getSFUToken(
  client: OpenIDClientParts,
  membership: CallMembershipIdentityParts,
  serviceUrl: string,
  roomId: string,
  opts?: {
    wsUrl?: string;
    forceJwtEndpoint?: JwtEndpointVersion;
    delayEndpointBaseUrl?: string;
    delayId?: string;
  },
  logger?: Logger,
): Promise<SFUConfig> {
  const wsUrl = opts?.wsUrl;
  const inMatrix2Mode =
    opts?.forceJwtEndpoint === JwtEndpointVersion.Matrix_2_0;

  if (inMatrix2Mode && wsUrl !== undefined) {
    try {
      logger?.info(`Trying to get a SFU token via the CS-Api for ${wsUrl}...`);
      return await getSFUConfigWithCSApi(
        client,
        membership,
        wsUrl,
        roomId,
        opts?.delayId,
        logger,
      );
    } catch (e) {
      // Anything but "the homeserver does not know these endpoints" is a real
      // error (e.g. we are not joined to the room, or the SFU does not belong
      // to the answering server). Falling back would only mask it.
      if (!isEndpointUnsupported(e)) throw e;
      logger?.info(
        `Homeserver does not support the MSC4195 CS-Api endpoints. Falling back to the openID based flow.`,
        e,
      );
    }
  }

  return await getSFUConfigLegacyWithOpenID(
    client,
    membership,
    serviceUrl,
    roomId,
    opts,
    logger,
  );
}

/**
 * Gets a SFU token from the homeserver (MSC4195) and delegates the delayed leave
 * event to it.
 *
 * Delegating the delayed leave event is best effort: if it fails we still have a
 * usable token and just have to keep restarting the delayed event ourselves.
 * @param client The Matrix client
 * @param membership Our own membership identity parts.
 * @param wsUrl The websocket URL of the livekit SFU to get a token for.
 * @param roomId The room id of the `m.rtc.member` event.
 * @param delayId The delay id of the delayed leave event to delegate. If
 * `undefined` no delegation is attempted.
 * @param logger optional logger.
 * @returns Object containing the token information
 * @throws MatrixError
 */
async function getSFUConfigWithCSApi(
  client: OpenIDClientParts,
  membership: CallMembershipIdentityParts,
  wsUrl: string,
  roomId: string,
  delayId?: string,
  logger?: Logger,
): Promise<SFUConfig> {
  // The homeserver knows our user id from the access token, so we only claim
  // the device id here.
  const member: LivekitRtcMember = {
    id: membership.memberId,
    claimed_device_id: membership.deviceId,
  };

  const { jwt } = await doNetworkOperationWithRetry(async () =>
    client._unstable_getLivekitToken({
      url: wsUrl,
      room_id: roomId,
      slot_id: SLOT_ID,
      member,
    }),
  );
  logger?.info(`Got SFU token via the CS-Api for ${wsUrl}`);
  const sfuConfig = extractFullConfigFromToken({ url: wsUrl, jwt });

  if (delayId !== undefined) {
    try {
      await doNetworkOperationWithRetry(async () =>
        client._unstable_delegateDelayedLeave({
          room_id: roomId,
          slot_id: SLOT_ID,
          member,
          delay_id: delayId,
        }),
      );
      logger?.info(
        `Delegated delayed leave event ${delayId} to the homeserver`,
      );
    } catch (e) {
      // Not fatal: we have a working token. Note that the homeserver rejects
      // delegation with M_BAD_JSON if the delayed event's timeout is below one
      // hour, so this is expected for deployments with a short
      // `delayed_leave_event_delay_ms`.
      logger?.warn(
        `Failed to delegate delayed leave event ${delayId} to the homeserver. We need to keep restarting it ourselves.`,
        e,
      );
    }
  }

  return sfuConfig;
}

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
