/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { useCallback, useSyncExternalStore } from "react";

const NONE: CallMembership[] = [];

/**
 * The memberships of a matrix-js-sdk session, kept current; none without a
 * session (the Rust crate carries the call then).
 */
export function useMatrixRTCSessionMemberships(
  rtcSession: MatrixRTCSession | undefined,
): CallMembership[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (rtcSession === undefined) return (): void => {};
      rtcSession.on(MatrixRTCSessionEvent.MembershipsChanged, onChange);
      return (): void => {
        rtcSession.off(MatrixRTCSessionEvent.MembershipsChanged, onChange);
      };
    },
    [rtcSession],
  );
  return useSyncExternalStore(
    subscribe,
    useCallback(() => rtcSession?.memberships ?? NONE, [rtcSession]),
  );
}
