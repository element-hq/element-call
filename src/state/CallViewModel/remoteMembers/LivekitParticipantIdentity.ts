/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { encodeUnpaddedBase64Url } from "matrix-js-sdk";
import { sha256 } from "matrix-js-sdk/lib/digest";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { from, type Observable } from "rxjs";

const livekitParticipantIdentityCache = new Map<string, string>();

/**
 * The string that is computed based on the membership and used for the computing the hash.
 * `${userId}:${deviceId}:${membershipID}`
 * as the direct imput for: await sha256(input)
 */
export const livekitIdentityInput = ({
  userId,
  deviceId,
  memberId,
}: CallMembershipIdentityParts): string => `${userId}|${deviceId}|${memberId}`;

export function computeLivekitParticipantIdentity$(
  membership: CallMembershipIdentityParts,
  kind: "rtc" | "session",
): Observable<string> {
  const compute = async (): Promise<string> => {
    switch (kind) {
      case "rtc": {
        const input = livekitIdentityInput(membership);
        if (livekitParticipantIdentityCache.size > 400)
          // prevent memory leaks in a stupid/simple way
          livekitParticipantIdentityCache.clear();
        // TODO use non deprecated memberId
        if (livekitParticipantIdentityCache.has(input))
          return livekitParticipantIdentityCache.get(input)!;
        else {
          const hashBuffer = await sha256(input);
          const hashedString = encodeUnpaddedBase64Url(hashBuffer);
          livekitParticipantIdentityCache.set(input, hashedString);
          return hashedString;
        }
      }
      case "session":
      default:
        return `${membership.userId}:${membership.deviceId}`;
    }
  };
  return from(compute());
}
