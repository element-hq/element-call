/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type BaseKeyProvider, ExternalE2EEKeyProvider } from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type MatrixRTCSession as JsSdkRtcSession } from "matrix-js-sdk/lib/matrixrtc";

import { E2eeType } from "../../../src/e2ee/e2eeType";
import { MatrixKeyProvider } from "../../../src/e2ee/matrixKeyProvider";
import { type EncryptionSystem } from "../../../src/e2ee/sharedKeyManagement";

/** The LiveKit key provider for the encryption the host asked for, or none. */
export function createKeyProvider(
  encryptionSystem: EncryptionSystem,
  session: JsSdkRtcSession,
  logger: Logger,
): BaseKeyProvider | undefined {
  switch (encryptionSystem.kind) {
    case E2eeType.NONE:
      return undefined;
    case E2eeType.PER_PARTICIPANT: {
      const keyProvider = new MatrixKeyProvider();
      keyProvider.setRTCSession(session);
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
