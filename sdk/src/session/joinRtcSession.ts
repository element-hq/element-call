/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LivekitTransport,
  type MatrixRTCSession as JsSdkRtcSession,
  type RTCCallIntent,
  type RTCNotificationType,
} from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import {
  DEFAULT_CONFIG,
  MatrixRTCMode,
} from "../../../src/config/ConfigOptions";

interface Options {
  encryptMedia: boolean;
  matrixRTCMode: MatrixRTCMode;
  sendNotificationType?: RTCNotificationType;
  callIntent?: RTCCallIntent;
}

/** The session's timing defaults; a later slice makes them an input. */
export const sessionTimings = {
  syncDisconnectGracePeriodMs: DEFAULT_CONFIG.sync_disconnect_grace_period_ms,
  ...DEFAULT_CONFIG.matrix_rtc_session,
};

/**
 * Sends the membership and starts the membership manager, which keeps it
 * alive and retries on failure.
 * @throws If the join could not be started.
 */
export function joinRtcSession(
  session: JsSdkRtcSession,
  ownMembershipIdentity: CallMembershipIdentityParts,
  transport: LivekitTransport,
  { encryptMedia, matrixRTCMode, sendNotificationType, callIntent }: Options,
): void {
  const timings = sessionTimings.delayed_leave;
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
    networkErrorRetryMs: sessionTimings.network_error_retry_ms,
    makeKeyDelay: sessionTimings.wait_for_key_rotation_ms,
    membershipEventExpiryMs: sessionTimings.membership_event_expiry_ms,
    keyRotationParticipantLimit: sessionTimings.key_rotation_participant_limit,
    unstableSendStickyEvents: matrixRTCMode === MatrixRTCMode.Matrix_2_0,
    maximumNetworkErrorRetryCount:
      Math.ceil(maxWaitMs / sessionTimings.network_error_retry_ms) + 1,
  });
}
