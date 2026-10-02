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
import { logger as rootLogger, type Logger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

export class MatrixKeyProvider extends BaseKeyProvider {
  private rtcSession?: MatrixRTCSession;
  private logger: Logger;
  public constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
    this.logger = rootLogger.getChild("[MatrixKeyProvider]");
  }

  public setRTCSession(rtcSession: MatrixRTCSession): void {
    if (this.rtcSession) {
      this.rtcSession.off(
        MatrixRTCSessionEvent.EncryptionKeyChanged,
        this.onEncryptionKeyChanged,
      );
    }

    this.rtcSession = rtcSession;

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
    crypto.subtle
      .importKey("raw", encryptionKey, "HKDF", false, [
        "deriveBits",
        "deriveKey",
      ])
      .then(
        (keyMaterial) => {
          this.onSetEncryptionKey(
            keyMaterial,
            rtcBackendIdentity,
            encryptionKeyIndex,
          );

          this.logger.debug(
            `Sent new key to livekit room=${this.rtcSession?.room.roomId} participantId=${rtcBackendIdentity} (before hash: ${membershipParts.userId}:${membershipParts.deviceId}) encryptionKeyIndex=${encryptionKeyIndex}`,
          );
        },
        (e) => {
          this.logger.error(
            `Failed to create key material from buffer for livekit room=${this.rtcSession?.room.roomId} participantId before hash=${membershipParts.userId}:${membershipParts.deviceId} encryptionKeyIndex=${encryptionKeyIndex}`,
            e,
          );
        },
      );
  };
}
