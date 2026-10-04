/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type MatrixRTCSession as JsSdkRTCSession,
  type RTCCallIntent,
  type RTCNotificationType,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import {
  type DelayedLeaveTimings,
  MatrixRTCMode,
  type SessionTimings,
} from "../config";

interface Options {
  encryptMedia: boolean;
  matrixRTCMode: MatrixRTCMode;
  sendNotificationType?: RTCNotificationType;
  applicationData?: Record<string, unknown>;
  timings: SessionTimings;
  /** The delayed leave timings to use: delegated to the SFU or not. */
  delayedLeave: DelayedLeaveTimings;
}

/**
 * Sends the membership and starts the membership manager, which keeps it
 * alive and retries on failure.
 * @throws If the join could not be started.
 */
export function joinJsSdkSession(
  session: JsSdkRTCSession,
  ownMembershipIdentity: CallMembershipIdentityParts,
  transport: Transport,
  {
    encryptMedia,
    matrixRTCMode,
    sendNotificationType,
    applicationData,
    timings,
    delayedLeave,
  }: Options,
): void {
  // The membership format carries the intent as a field of its own
  const { "m.call.intent": intent, ...rest } = applicationData ?? {};
  const callIntent =
    typeof intent === "string" ? (intent as RTCCallIntent) : undefined;
  // Give up on the network as soon as either the sync has been down for the
  // grace period or the delayed leave has probably been sent, whichever is
  // sooner
  const maxWaitMs = Math.min(
    timings.syncDisconnectGracePeriodMs,
    delayedLeave.delay_ms,
  );
  session.joinRTCSession(ownMembershipIdentity, [transport], {
    notificationType: sendNotificationType,
    callIntent,
    applicationData: rest,
    manageMediaKeys: encryptMedia,
    delayedLeaveEventRestartMs: delayedLeave.restart_ms,
    delayedLeaveEventDelayMs: delayedLeave.delay_ms,
    delayedLeaveEventRestartLocalTimeoutMs: delayedLeave.restart_timeout_ms,
    networkErrorRetryMs: timings.networkErrorRetryMs,
    makeKeyDelay: timings.waitForKeyRotationMs,
    membershipEventExpiryMs: timings.membershipEventExpiryMs,
    keyRotationParticipantLimit: timings.keyRotationParticipantLimit,
    unstableSendStickyEvents: matrixRTCMode === MatrixRTCMode.Matrix_2_0,
    maximumNetworkErrorRetryCount:
      Math.ceil(maxWaitMs / timings.networkErrorRetryMs) + 1,
  });
}
