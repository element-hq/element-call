/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect } from "react";
import { type MatrixClient, type Room } from "matrix-js-sdk";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

const logger = rootLogger.getChild("[OlmPrewarm]");

/**
 * Pre-warms Olm sessions with current call participants while the user is in
 * the lobby. This avoids a `/keys/claim` round-trip when actually joining the
 * call and distributing E2EE media encryption keys.
 *
 * Internally calls `CryptoApi.prepareToEncrypt(room)` which triggers
 * `KeyClaimManager.ensureSessionsForUsers()` for all room members, establishing
 * Olm sessions with any devices we haven't communicated with before.
 *
 * @param client - The Matrix client.
 * @param room - The room the call is in.
 * @param memberships - Current call memberships (used to trigger re-warming
 *   when new participants join while the user is still in the lobby).
 * @param enabled - Pass `false` to disable (e.g. when the user has already
 *   joined the call or E2EE is not in use).
 */
export function usePrewarmOlmSessions(
  client: MatrixClient,
  room: Room,
  memberships: CallMembership[],
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    if (memberships.length === 0) return;

    const crypto = client.getCrypto();
    if (!crypto) {
      logger.debug("No crypto available, skipping Olm session pre-warming");
      return;
    }

    logger.info(
      `Pre-warming Olm sessions for room ${room.roomId} (${memberships.length} call members)`,
    );
    crypto.prepareToEncrypt(room);
  }, [client, room, memberships, enabled]);
}
