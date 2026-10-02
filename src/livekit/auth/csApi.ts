/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { extractFullConfigFromToken, type SFUConfig } from "./types.ts";
import { doNetworkOperationWithRetry } from "../../utils/matrix.ts";

// TODO: This should come from the `MatrixRTCSession`s slot description instead
// of being hardcoded here. (the legacy flow hardcodes it as well)
const SLOT_ID = "m.call#ROOM";

export type ClientGetTokenParts = Pick<
  MatrixClient,
  "_unstable_getLivekitToken"
>;

export async function getSFUConfig({
  client,
  membership,
  url,
  roomId,
}: {
  client: ClientGetTokenParts;
  membership: CallMembershipIdentityParts;
  url: string;
  roomId: string;
}): Promise<SFUConfig> {
  const res = await doNetworkOperationWithRetry(async () =>
    client._unstable_getLivekitToken({
      url,
      room_id: roomId,
      slot_id: "m.call#ROOM",
      member_id: membership.memberId,
    }),
  );
  return extractFullConfigFromToken({ url, jwt: res.jwt });
}

export type ClientDelegationParts = Pick<
  MatrixClient,
  "_unstable_delegateDelayedLeave" | "baseUrl"
>;

export async function delegateDelayedLeave({
  client,
  membership,
  url,
  roomId,
  delayId,
}: {
  client: ClientDelegationParts;
  membership: CallMembershipIdentityParts;
  url: string;
  roomId: string;
  delayId: string;
}): Promise<void> {
  await doNetworkOperationWithRetry(async () =>
    client._unstable_delegateDelayedLeave({
      url,
      room_id: roomId,
      slot_id: SLOT_ID,
      member_id: membership.memberId,
      delay_id: delayId,
    }),
  );
}
