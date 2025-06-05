/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { useCallback } from "react";

import { useTypedEventEmitterState } from "./useEvents";

export function useMatrixRTCSessionMemberships(
  rtcSession: MatrixRTCSession,
): CallMembership[] {
  return useTypedEventEmitterState(
    rtcSession,
    MatrixRTCSessionEvent.MembershipsChanged,
    useCallback(() => rtcSession.memberships, [rtcSession]),
  );
}
