/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { BaseKeyProvider, createKeyMaterialFromBuffer } from "livekit-client";
import { logger } from "matrix-js-sdk/src/logger";
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";

export class MatrixKeyProvider extends BaseKeyProvider {
  private rtcSession?: MatrixRTCSession;

  public constructor() {
    super({ ratchetWindowSize: 0 });
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
    // so emit a key changed event.
    for (const [
      participant,
      encryptionKeys,
    ] of this.rtcSession.getEncryptionKeys()) {
      for (const [index, encryptionKey] of encryptionKeys.entries()) {
        this.onEncryptionKeyChanged(encryptionKey, index, participant);
      }
    }
  }

  private onEncryptionKeyChanged = async (
    encryptionKey: Uint8Array,
    encryptionKeyIndex: number,
    participantId: string,
  ): Promise<void> => {
    this.onSetEncryptionKey(
      await createKeyMaterialFromBuffer(encryptionKey),
      participantId,
      encryptionKeyIndex,
    );

    logger.debug(
      `Sent new key to livekit room=${this.rtcSession?.room.roomId} participantId=${participantId} encryptionKeyIndex=${encryptionKeyIndex}`,
    );
  };
}
