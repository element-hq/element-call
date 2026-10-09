/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type BaseKeyProvider, ExternalE2EEKeyProvider } from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type Observable } from "rxjs";

import { E2eeType, type EncryptionSystem } from "../../encryption";
import { type MediaKey } from "../api";
import { MatrixKeyProvider } from "./MatrixKeyProvider";

/** The LiveKit key provider for the encryption the host asked for, or none. */
export function createKeyProvider(
  encryptionSystem: EncryptionSystem,
  mediaKeys$: Observable<MediaKey>,
  logger: Logger,
): BaseKeyProvider | undefined {
  switch (encryptionSystem.kind) {
    case E2eeType.NONE:
      return undefined;
    case E2eeType.PER_PARTICIPANT: {
      const keyProvider = new MatrixKeyProvider();
      keyProvider.setMediaKeys(mediaKeys$);
      return keyProvider;
    }
    case E2eeType.SHARED_KEY: {
      const keyProvider = new ExternalE2EEKeyProvider();
      keyProvider
        .setKey(encryptionSystem.secret)
        .catch((e) => logger.error("Failed to set the shared E2EE key", e));
      return keyProvider;
    }
  }
}
