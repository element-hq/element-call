/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BaseKeyProvider } from "livekit-client";
import { combineLatest } from "rxjs";
import { logger as rootLogger, type Logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../state/Behavior";
import { type Epoch, type ObservableScope } from "../state/ObservableScope";
import { type FfiMediaKey, type FfiMembership } from "../matrix-rtc-sdk";

/** What this provider needs from a {@link RtcParticipationManager}. */
export interface ParticipationKeys {
  /** Every media key in use, ours and theirs, one per (member, index). */
  keyMap$: Behavior<FfiMediaKey[]>;
  memberships$: Behavior<Epoch<FfiMembership[]>>;
  ownMemberId$: Behavior<string | null>;
  ownTransportIdentity$: Behavior<string | null>;
}

/**
 * Feeds the crate's media keys to livekit-client's E2EE workers.
 *
 * The crate exchanges keys per member id; LiveKit encrypts per participant
 * identity. A key is handed over as soon as both are known — a key that
 * arrives before its member's transport identity waits on the roster rather
 * than being dropped — and once per (member, index, identity), so a
 * re-emitted map does not churn the key ring.
 */
export class ParticipationKeyProvider extends BaseKeyProvider {
  private readonly logger: Logger;
  private readonly applied = new Set<string>();

  public constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
    this.logger = rootLogger.getChild("[ParticipationKeyProvider]");
  }

  /** Follow the participation's keys for as long as `scope` lives. */
  public attach(
    scope: ObservableScope,
    rtcParticipationManager: ParticipationKeys,
  ): void {
    combineLatest([
      rtcParticipationManager.keyMap$,
      rtcParticipationManager.memberships$,
      rtcParticipationManager.ownMemberId$,
      rtcParticipationManager.ownTransportIdentity$,
    ])
      .pipe(scope.bind())
      .subscribe(([keys, memberships, ownMemberId, ownIdentity]) => {
        for (const key of keys) {
          const identity =
            key.memberId === ownMemberId
              ? ownIdentity
              : memberships.value.find(
                  (m) => m.member.memberId === key.memberId,
                )?.transportIdentity;
          if (!identity) continue;
          const tag = `${key.memberId}|${key.index}|${identity}`;
          if (this.applied.has(tag)) continue;
          this.applied.add(tag);
          void this.setKey(key, identity);
        }
      });
  }

  private async setKey(key: FfiMediaKey, identity: string): Promise<void> {
    try {
      const material = await crypto.subtle.importKey(
        "raw",
        key.key,
        "HKDF",
        false,
        ["deriveBits", "deriveKey"],
      );
      this.onSetEncryptionKey(material, identity, key.index);
      this.logger.debug(
        `Set key for participant ${identity} (member ${key.memberId}) index ${key.index}`,
      );
    } catch (e) {
      this.logger.error(
        `Failed to import the key of member ${key.memberId} index ${key.index}`,
        e,
      );
    }
  }
}
