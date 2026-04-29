/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BaseKeyProvider } from "livekit-client";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
const logger = rootLogger.getChild("[MatrixKeyProvider]");

export class MatrixKeyProvider extends BaseKeyProvider {
  private rtcSession?: MatrixRTCSession;
  private joinedAt?: number;

  public constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
  }

  public setRTCSession(rtcSession: MatrixRTCSession): void {
    if (this.rtcSession) {
      this.rtcSession.off(
        MatrixRTCSessionEvent.EncryptionKeyChanged,
        this.onEncryptionKeyChanged,
      );
    }

    this.rtcSession = rtcSession;
    this.joinedAt = Date.now();
    logger.info(`setRTCSession called, recording join timestamp`);

    this.rtcSession.on(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      this.onEncryptionKeyChanged,
    );

    // The new session could be aware of keys of which the old session wasn't,
    // so emit key changed events
    this.rtcSession.reemitEncryptionKeys();
  }

  private onEncryptionKeyChanged = (
    encryptionKey: Uint8Array<ArrayBuffer>,
    encryptionKeyIndex: number,
    membershipParts: CallMembershipIdentityParts,
    rtcBackendIdentity: string,
  ): void => {
    const keyReceivedAt = Date.now();
    const timeSinceJoin = this.joinedAt
      ? keyReceivedAt - this.joinedAt
      : undefined;
    logger.info(
      `Key received ${timeSinceJoin !== undefined ? `${timeSinceJoin}ms after join` : "(no join timestamp)"} for ${membershipParts.userId}:${membershipParts.deviceId} index=${encryptionKeyIndex}`,
    );

    crypto.subtle
      .importKey("raw", encryptionKey, "HKDF", false, [
        "deriveBits",
        "deriveKey",
      ])
      .then(
        (keyMaterial) => {
          const importDuration = Date.now() - keyReceivedAt;
          this.onSetEncryptionKey(
            keyMaterial,
            rtcBackendIdentity,
            encryptionKeyIndex,
          );

          logger.info(
            `Key imported in ${importDuration}ms and sent to livekit room=${this.rtcSession?.room.roomId} participantId=${rtcBackendIdentity} (before hash: ${membershipParts.userId}:${membershipParts.deviceId}) encryptionKeyIndex=${encryptionKeyIndex}`,
          );
        },
        (e) => {
          logger.error(
            `Failed to create key material from buffer for livekit room=${this.rtcSession?.room.roomId} participantId before hash=${membershipParts.userId}:${membershipParts.deviceId} encryptionKeyIndex=${encryptionKeyIndex}`,
            e,
          );
        },
      );
  };
}
