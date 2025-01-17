/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { useEffect, useState } from "react";

export function useMatrixRTCSessionJoinState(
  rtcSession: MatrixRTCSession | undefined,
): boolean {
  const [, setNumUpdates] = useState(0);

  useEffect(() => {
    if (rtcSession !== undefined) {
      const onJoinStateChanged = (isJoined: boolean): void => {
        logger.info(
          `Session in room ${rtcSession.room.roomId} changed to ${
            isJoined ? "joined" : "left"
          }`,
        );
        setNumUpdates((n) => n + 1); // Force an update
      };
      rtcSession.on(MatrixRTCSessionEvent.JoinStateChanged, onJoinStateChanged);

      return (): void => {
        rtcSession.off(
          MatrixRTCSessionEvent.JoinStateChanged,
          onJoinStateChanged,
        );
      };
    }
  }, [rtcSession]);

  return rtcSession?.isJoined() ?? false;
}
