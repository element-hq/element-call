/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BaseKeyProvider, createKeyMaterialFromBuffer, importKey, KeyProviderEvent } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";

export class MatrixKeyProvider extends BaseKeyProvider {
  private rtcSession?: MatrixRTCSession;

  private readonly onKeyRatchetComplete: (material: ArrayBuffer, keyIndex?: number) => void;

  public constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 10 });

    this.onKeyRatchetComplete = (material: ArrayBuffer, keyIndex?: number): void => {
      logger.debug(`key ratcheted event received for index `, keyIndex );
      this.rtcSession?.onOwnKeyRatcheted(material, keyIndex).catch((e) => {
        logger.error(
          `Failed to ratchet key for livekit room=${this.rtcSession?.room.roomId} keyIndex=${keyIndex}`,
          e,
        );
      });
    };

    this.on(KeyProviderEvent.RatchetRequestCompleted, this.onKeyRatchetComplete);
  }

  public setRTCSession(rtcSession: MatrixRTCSession): void {
    if (this.rtcSession) {
      this.rtcSession.off(
        MatrixRTCSessionEvent.EncryptionKeyChanged,
        this.onEncryptionKeyChanged,
      );
      this.rtcSession.off(
        MatrixRTCSessionEvent.EncryptionKeyQueryRatchetStep,
        this.doRatchetKey,
      );

    }

    this.rtcSession = rtcSession;

    this.rtcSession.on(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      this.onEncryptionKeyChanged,
    );

    this.rtcSession.on(
      MatrixRTCSessionEvent.EncryptionKeyQueryRatchetStep,
      this.doRatchetKey,
    );


    // The new session could be aware of keys of which the old session wasn't,
    // so emit key changed events
    this.rtcSession.reemitEncryptionKeys();
  }

  private doRatchetKey = (participantId:string, keyIndex:number): void => {
      this.ratchetKey(participantId, keyIndex);
  }

  private onEncryptionKeyChanged = (
    encryptionKey: Uint8Array,
    encryptionKeyIndex: number,
    participantId: string,
  ): void => {
    importKey(encryptionKey, "HKDF", 'derive').then(
      (keyMaterial) => {
        this.onSetEncryptionKey(keyMaterial, participantId, encryptionKeyIndex);

        logger.debug(
          `Sent new key to livekit room=${this.rtcSession?.room.roomId} participantId=${participantId} encryptionKeyIndex=${encryptionKeyIndex}`,
        );
      },
      (e) => {
        logger.error(
          `Failed to create key material from buffer for livekit room=${this.rtcSession?.room.roomId} participantId=${participantId} encryptionKeyIndex=${encryptionKeyIndex}`,
          e,
        );
      },
    );
  };
}
