/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
      `Embedded-E2EE-LOG onEncryptionKeyChanged room=${this.rtcSession?.room.roomId} participantId=${participantId} encryptionKeyIndex=${encryptionKeyIndex} encryptionKey=${encryptionKey}`,
      this.getKeys(),
    );
  };
}
