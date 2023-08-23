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

import { logger } from "@sentry/utils";
import { BaseKeyProvider, createKeyMaterialFromString } from "livekit-client";
import { CallMembership } from "matrix-js-sdk/src/matrixrtc/CallMembership";
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";

export class MatrixKeyProvider extends BaseKeyProvider {
  private rtcSession?: MatrixRTCSession;

  public setRTCSession(rtcSession: MatrixRTCSession) {
    const encryptionKey = rtcSession.activeEncryptionKey;
    if (!encryptionKey) {
      throw new Error(
        "MatrixKeyProvider requires the given MatrixRTCSession to have an activeEncryptionKey"
      );
    }

    if (this.rtcSession) {
      this.rtcSession.off(
        MatrixRTCSessionEvent.MembershipsChanged,
        this.onMemberShipsChanged
      );
      this.rtcSession.off(
        MatrixRTCSessionEvent.ActiveEncryptionKeyChanged,
        this.onEncryptionKeyChanged
      );
    }

    this.rtcSession = rtcSession;

    this.rtcSession.on(
      MatrixRTCSessionEvent.MembershipsChanged,
      this.onMemberShipsChanged
    );
    this.rtcSession.on(
      MatrixRTCSessionEvent.ActiveEncryptionKeyChanged,
      this.onEncryptionKeyChanged
    );

    this.onEncryptionKeyChanged(encryptionKey);
    this.onMemberShipsChanged([], this.rtcSession.memberships);
  }

  private onEncryptionKeyChanged = async (key: string) => {
    this.onSetEncryptionKey(await createKeyMaterialFromString(key), undefined);
  };

  private onMemberShipsChanged = async (
    _: CallMembership[],
    newMemberships: CallMembership[]
  ) => {
    for (const membership of newMemberships) {
      const participantId = `${membership.member.userId}:${membership.deviceId}`;
      const encryptionKey = await membership.getActiveEncryptionKey();

      if (!encryptionKey) {
        logger.warn(
          `Participant ${participantId} did not share a key over Matrix`
        );
        continue;
      }

      this.onSetEncryptionKey(
        await createKeyMaterialFromString(encryptionKey),
        participantId
      );
    }
  };
}
