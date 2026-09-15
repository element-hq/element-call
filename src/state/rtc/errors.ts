/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  FfiDisconnectCause,
  FfiJoinError,
  FfiStatus,
} from "../../matrix-rtc-sdk";
import {
  ConnectionLostError,
  type ElementCallError,
  MatrixRTCTransportMissingError,
  MembershipManagerError,
  StickyEventsRequiredError,
} from "../../utils/errors";

export interface DisconnectContext {
  /** The homeserver's domain, for the "no transport" message. */
  domain: string;
  /** Whether the homeserver was found to accept sticky events. */
  stickyEventsSupported: boolean;
}

/**
 * The error a participation ended with, or null when it ended on purpose
 * (never joined, or the host left).
 *
 * The crate splits failures into recoverable state (`impairments`, which the
 * call UI shows as interruptions) and terminal causes; only the latter are
 * errors here.
 */
export function errorForStatus(
  status: FfiStatus,
  context: DisconnectContext,
): ElementCallError | null {
  if (!FfiStatus.Disconnected.instanceOf(status)) return null;
  const cause = status.inner.cause;
  if (
    FfiDisconnectCause.NeverJoined.instanceOf(cause) ||
    FfiDisconnectCause.LeftByHost.instanceOf(cause)
  )
    return null;
  if (FfiDisconnectCause.JoinFailed.instanceOf(cause)) {
    const error = cause.inner.error;
    if (FfiJoinError.NoTransport.instanceOf(error))
      return new MatrixRTCTransportMissingError(context.domain);
    // A homeserver that refuses sticky events fails the very first send.
    if (FfiJoinError.Driver.instanceOf(error) && !context.stickyEventsSupported)
      return new StickyEventsRequiredError();
    return new MembershipManagerError(new Error(describeJoinError(error)));
  }
  // SlotClosed, ManagerStopped: we are out and nothing will bring us back.
  return new ConnectionLostError();
}

function describeJoinError(error: FfiJoinError): string {
  const inner: unknown = "inner" in error ? error.inner : undefined;
  const message =
    typeof inner === "object" && inner !== null && "message" in inner
      ? inner.message
      : undefined;
  return typeof message === "string" ? `${error.tag}: ${message}` : error.tag;
}
