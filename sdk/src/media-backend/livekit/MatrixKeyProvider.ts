/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BaseKeyProvider } from "livekit-client";
import { logger as rootLogger, type Logger } from "matrix-js-sdk/lib/logger";
import { type Observable, type Subscription } from "rxjs";

import { type MediaKey } from "../api";

/** LiveKit's key provider, fed from the session's per-participant media keys. */
export class MatrixKeyProvider extends BaseKeyProvider {
  private subscription?: Subscription;
  private logger: Logger;
  public constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
    this.logger = rootLogger.getChild("[MatrixKeyProvider]");
  }

  public setMediaKeys(mediaKeys$: Observable<MediaKey>): void {
    this.subscription?.unsubscribe();
    this.subscription = mediaKeys$.subscribe(this.onMediaKey);
  }

  private onMediaKey = ({ key, index, participantId }: MediaKey): void => {
    crypto.subtle
      .importKey("raw", key, "HKDF", false, ["deriveBits", "deriveKey"])
      .then(
        (keyMaterial) => {
          this.onSetEncryptionKey(keyMaterial, participantId, index);
          this.logger.debug(
            `Sent new key to livekit participantId=${participantId} encryptionKeyIndex=${index}`,
          );
        },
        (e) => {
          this.logger.error(
            `Failed to create key material from buffer for livekit participantId=${participantId} encryptionKeyIndex=${index}`,
            e,
          );
        },
      );
  };
}
