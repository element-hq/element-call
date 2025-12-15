/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BaseKeyProvider } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import {
  computeLivekitParticipantIdentity,
  livekitIdentityInput,
} from "../state/CallViewModel/remoteMembers/MatrixLivekitMembers";

export class MatrixKeyProvider extends BaseKeyProvider {
  private rtcSession?: MatrixRTCSession;

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

    this.rtcSession.on(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      this.onEncryptionKeyChanged,
    );

    // The new session could be aware of keys of which the old session wasn't,
    // so emit key changed events
    this.rtcSession.reemitEncryptionKeys();
  }

  private onEncryptionKeyChanged = (
    encryptionKey: Uint8Array,
    encryptionKeyIndex: number,
    membership: CallMembershipIdentityParts,
  ): void => {
    const unhashedIdentity = livekitIdentityInput(membership);

    // This is the only way we can get the kind of the membership event we just received the key for.
    // best case we want to recompute this once the memberships change (you can receive the key before the participant...)
    //
    // TODO change this to `?? "rtc"` for newer versions.
    const kind =
      this.rtcSession?.memberships.find(
        (m) =>
          m.userId === membership.userId &&
          m.deviceId === membership.deviceId &&
          m.memberId === membership.memberId,
      )?.kind ?? "session";

    Promise.all([
      crypto.subtle.importKey("raw", encryptionKey, "HKDF", false, [
        "deriveBits",
        "deriveKey",
      ]),
      computeLivekitParticipantIdentity(membership, kind),
    ]).then(
      ([keyMaterial, livekitParticipantId]) => {
        this.onSetEncryptionKey(
          keyMaterial,
          livekitParticipantId,
          encryptionKeyIndex,
        );

        logger.debug(
          `Sent new key to livekit room=${this.rtcSession?.room.roomId} participantId=${livekitParticipantId} (before hash: ${unhashedIdentity}) encryptionKeyIndex=${encryptionKeyIndex}`,
        );
      },
      (e) => {
        logger.error(
          `Failed to create key material from buffer for livekit room=${this.rtcSession?.room.roomId} participantId before hash=${unhashedIdentity} encryptionKeyIndex=${encryptionKeyIndex}`,
          e,
        );
      },
    );
  };
}
