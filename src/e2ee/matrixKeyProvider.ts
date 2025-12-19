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
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
const logger = rootLogger.getChild("[MatrixKeyProvider]");

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
      this.rtcSession.off(
        MatrixRTCSessionEvent.MembershipsChanged,
        this.onMembershipsChanged,
      );
    }

    this.rtcSession = rtcSession;

    this.rtcSession.on(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      this.onEncryptionKeyChanged,
    );
    this.rtcSession.on(
      MatrixRTCSessionEvent.MembershipsChanged,
      this.onMembershipsChanged,
    );

    // The new session could be aware of keys of which the old session wasn't,
    // so emit key changed events
    this.rtcSession.reemitEncryptionKeys();
  }

  private keyCache = new Array<{
    membership: CallMembershipIdentityParts;
    encryptionKey: Uint8Array;
    encryptionKeyIndex: number;
  }>();

  private onMembershipsChanged = (): void => {
    const duplicatedArray = this.keyCache;
    // Reset key cache first. It will get repopulated when calling `onEncryptionKeyChanged`
    this.keyCache = [];
    let next = duplicatedArray.pop();
    while (next !== undefined) {
      logger.debug(
        "[KeyCache] remove key event from the cache and try adding it again. For membership: ",
        next.membership,
      );
      this.onEncryptionKeyChanged(
        next.encryptionKey,
        next.encryptionKeyIndex,
        next.membership,
      );
      next = duplicatedArray.pop();
    }
  };

  private onEncryptionKeyChanged = (
    encryptionKey: Uint8Array,
    encryptionKeyIndex: number,
    membership: CallMembershipIdentityParts,
  ): void => {
    // This is the only way we can get the kind of the membership event we just received the key for.
    // best case we want to recompute this once the memberships change (you can receive the key before the participant...)
    const membershipFull = this.rtcSession?.memberships.find(
      (m) =>
        m.userId === membership.userId &&
        m.deviceId === membership.deviceId &&
        m.memberId === membership.memberId,
    );
    if (!membershipFull) {
      logger.debug(
        "[KeyCache] Added key event to the cache because we do not have a membership for it (yet): ",
        membership,
      );
      this.keyCache.push({ membership, encryptionKey, encryptionKeyIndex });
      return;
    }

    crypto.subtle
      .importKey("raw", encryptionKey, "HKDF", false, [
        "deriveBits",
        "deriveKey",
      ])
      .then(
        (keyMaterial) => {
          this.onSetEncryptionKey(
            keyMaterial,
            membershipFull.rtcBackendIdentity,
            encryptionKeyIndex,
          );

          logger.debug(
            `Sent new key to livekit room=${this.rtcSession?.room.roomId} participantId=${membershipFull.rtcBackendIdentity} (before hash: ${membershipFull.userId}) encryptionKeyIndex=${encryptionKeyIndex}`,
          );
        },
        (e) => {
          logger.error(
            `Failed to create key material from buffer for livekit room=${this.rtcSession?.room.roomId} participantId before hash=${membershipFull.userId} encryptionKeyIndex=${encryptionKeyIndex}`,
            e,
          );
        },
      );
  };
}
