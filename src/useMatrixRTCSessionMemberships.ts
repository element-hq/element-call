/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import {
  type CallMembership,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { useCallback, useEffect, useState } from "react";

export function useMatrixRTCSessionMemberships(
  rtcSession: MatrixRTCSession,
): CallMembership[] {
  const [memberships, setMemberships] = useState(rtcSession.memberships);

  const onMembershipsChanged = useCallback(() => {
    logger.info(
      `Memberships changed for call in room ${rtcSession.room.roomId} (${rtcSession.memberships.length} members)`,
    );
    setMemberships(rtcSession.memberships);
  }, [rtcSession]);

  useEffect(() => {
    rtcSession.on(
      MatrixRTCSessionEvent.MembershipsChanged,
      onMembershipsChanged,
    );

    return (): void => {
      rtcSession.off(
        MatrixRTCSessionEvent.MembershipsChanged,
        onMembershipsChanged,
      );
    };
  }, [rtcSession, onMembershipsChanged]);

  return memberships;
}
