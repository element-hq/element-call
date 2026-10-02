/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LivekitTransport,
  type MatrixRTCSession as JsSdkRTCSession,
  type RTCCallIntent,
  type RTCNotificationType,
} from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { defaultSessionTimings, MatrixRTCMode } from "../config";

interface Options {
  encryptMedia: boolean;
  matrixRTCMode: MatrixRTCMode;
  sendNotificationType?: RTCNotificationType;
  applicationData?: Record<string, unknown>;
}

/** The session's timings; a later slice makes them an input. */
export const sessionTimings = defaultSessionTimings;

/**
 * Sends the membership and starts the membership manager, which keeps it
 * alive and retries on failure.
 * @throws If the join could not be started.
 */
export function joinJsSdkSession(
  session: JsSdkRTCSession,
  ownMembershipIdentity: CallMembershipIdentityParts,
  transport: LivekitTransport,
  {
    encryptMedia,
    matrixRTCMode,
    sendNotificationType,
    applicationData,
  }: Options,
): void {
  // The one piece of application data the js-sdk can put in a membership
  const intent = applicationData?.["m.call.intent"];
  const callIntent =
    typeof intent === "string" ? (intent as RTCCallIntent) : undefined;
  const timings = sessionTimings.delayedLeave;
  // Give up on the network as soon as either the sync has been down for the
  // grace period or the delayed leave has probably been sent, whichever is
  // sooner
  const maxWaitMs = Math.min(
    sessionTimings.syncDisconnectGracePeriodMs,
    timings.delay_ms,
  );
  session.joinRTCSession(ownMembershipIdentity, [transport], {
    notificationType: sendNotificationType,
    callIntent,
    manageMediaKeys: encryptMedia,
    delayedLeaveEventRestartMs: timings.restart_ms,
    delayedLeaveEventDelayMs: timings.delay_ms,
    delayedLeaveEventRestartLocalTimeoutMs: timings.restart_timeout_ms,
    networkErrorRetryMs: sessionTimings.networkErrorRetryMs,
    makeKeyDelay: sessionTimings.waitForKeyRotationMs,
    membershipEventExpiryMs: sessionTimings.membershipEventExpiryMs,
    keyRotationParticipantLimit: sessionTimings.keyRotationParticipantLimit,
    unstableSendStickyEvents: matrixRTCMode === MatrixRTCMode.Matrix_2_0,
    maximumNetworkErrorRetryCount:
      Math.ceil(maxWaitMs / sessionTimings.networkErrorRetryMs) + 1,
  });
}
