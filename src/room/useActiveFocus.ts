/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { useCallback, useEffect, useRef } from "react";
import { deepCompare } from "matrix-js-sdk/lib/utils";
import { logger } from "matrix-js-sdk/lib/logger";
import { type LivekitFocus, isLivekitFocus } from "matrix-js-sdk/lib/matrixrtc";

import { useTypedEventEmitterState } from "../useEvents";

/**
 * Gets the currently active (livekit) focus for a MatrixRTC session
 * This logic is specific to livekit foci where the whole call must use one
 * and the same focus.
 */
export function useActiveLivekitFocus(
  rtcSession: MatrixRTCSession,
): LivekitFocus | undefined {
  const activeFocus = useTypedEventEmitterState(
    rtcSession,
    MatrixRTCSessionEvent.MembershipsChanged,
    useCallback(() => {
      const f = rtcSession.getActiveFocus();
      // Only handle foci with type="livekit" for now.
      return !!f && isLivekitFocus(f) ? f : undefined;
    }, [rtcSession]),
  );

  const prevActiveFocus = useRef(activeFocus);
  useEffect(() => {
    if (!deepCompare(activeFocus, prevActiveFocus.current)) {
      const oldestMembership = rtcSession.getOldestMembership();
      logger.warn(
        `Got new active focus from membership: ${oldestMembership?.sender}/${oldestMembership?.deviceId}.
        Updated focus (focus switch) from ${JSON.stringify(prevActiveFocus.current)} to ${JSON.stringify(activeFocus)}`,
      );
      prevActiveFocus.current = activeFocus;
    }
  }, [activeFocus, rtcSession]);

  return activeFocus;
}
