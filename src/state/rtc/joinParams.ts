/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ResolvedConfigOptions,
  MatrixRTCMode,
} from "../../config/ConfigOptions";
import {
  FfiElementCallCompat,
  type FfiJoinParams,
  type FfiParticipationConfig,
} from "../../matrix-rtc-sdk";
import { ELEMENT_CALL_APPLICATION } from "./slot";

/** matrix-js-sdk caps a sticky membership at an hour; so does the crate. */
const MAX_STICKY_DURATION_MS = 60 * 60 * 1000;
/** matrix-js-sdk's default membership expiry when the config names none. */
const DEFAULT_MEMBERSHIP_EXPIRY_MS = 4 * 60 * 60 * 1000;

/**
 * Which dialect the crate speaks for a given mode. `compatibility` is
 * MSC3401 state events for the clients that predate sticky events;
 * `matrix_2_0` is spec MSC4143 — sticky member events, slots (which Element
 * Call opens) and the spec key message, the same wire format Element X's
 * matrix-rtc crates speak.
 */
export function compatForMode(mode: MatrixRTCMode): FfiElementCallCompat {
  switch (mode) {
    case MatrixRTCMode.Compatibility:
      return FfiElementCallCompat.StateEvents;
    case MatrixRTCMode.Matrix_2_0:
      return FfiElementCallCompat.Off;
  }
}

export interface ParticipationConfigInputs {
  mode: MatrixRTCMode;
  /** Whether this call encrypts media with per-participant keys. */
  manageMediaKeys: boolean;
  /**
   * Whether to discard media keys from senders not reported as cross-signed
   * (MSC4153). Off for parity with matrix-js-sdk, which never checked, and
   * because a passwordless guest cannot be cross-signed.
   *
   * TODO: we want this on. Turning it on needs (1) the SPA's passwordless
   * users to be cross-signed or given another way in, and (2) the crate to
   * report the sender's verdict on the tile while the check is off
   * (`FfiMediaKeyState.senderCrossSigned`, plan item C10), so the UI can
   * show an unverified sender before the switch flips.
   */
  requireCrossSignedSender?: boolean;
  session: ResolvedConfigOptions["matrix_rtc_session"];
}

export function participationConfig({
  mode,
  manageMediaKeys,
  requireCrossSignedSender = false,
  session,
}: ParticipationConfigInputs): FfiParticipationConfig {
  return {
    compat: compatForMode(mode),
    manageMediaKeys,
    requireCrossSignedSender,
    useKeyDelayMs: BigInt(session.wait_for_key_rotation_ms ?? 1000),
  };
}

export interface JoinParamsInputs {
  session: ResolvedConfigOptions["matrix_rtc_session"];
  /** `m.call.intent`: what kind of call the user is starting. */
  callIntent?: string;
  /**
   * Hand the delayed leave to the SFU (MSC4195). The crate tries the
   * homeserver, then the authorisation service, then keeps restarting the
   * leave itself, so there is no reason not to ask. Tests turn it off.
   */
  delegateDelayedLeave?: boolean;
}

/**
 * The crate's join parameters from Element Call's `matrix_rtc_session`
 * config. Keys the crate has no knob for (`restart_ms`, `restart_timeout_ms`,
 * `network_error_retry_ms`, `key_rotation_participant_limit`,
 * `delegated_delayed_leave.restart_ms`) have no effect any more.
 */
export function joinParamsFromConfig({
  session,
  callIntent,
  delegateDelayedLeave = true,
}: JoinParamsInputs): FfiJoinParams {
  return {
    applicationType: ELEMENT_CALL_APPLICATION,
    intent: callIntent,
    stickyDurationMs: BigInt(
      Math.min(
        session.membership_event_expiry_ms ?? DEFAULT_MEMBERSHIP_EXPIRY_MS,
        MAX_STICKY_DURATION_MS,
      ),
    ),
    keepAliveTimeoutMs: BigInt(session.delayed_leave.delay_ms),
    degradedLifetimeMs: undefined,
    delegateDelayedLeave,
    delegatedDelayMs: BigInt(session.delegated_delayed_leave.delay_ms),
  };
}
