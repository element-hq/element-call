/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { useCallback, useEffect, useState } from "react";

export function useMatrixRTCSessionJoinState(
  rtcSession: MatrixRTCSession,
): boolean {
  const [isJoined, setJoined] = useState(rtcSession.isJoined());

  const onJoinStateChanged = useCallback(
    (isJoined: boolean) => {
      logger.info(
        `Session in room ${rtcSession.room.roomId} changed to ${
          isJoined ? "joined" : "left"
        }`,
      );
      setJoined(isJoined);
    },
    [rtcSession],
  );

  useEffect(() => {
    rtcSession.on(MatrixRTCSessionEvent.JoinStateChanged, onJoinStateChanged);

    return (): void => {
      rtcSession.off(
        MatrixRTCSessionEvent.JoinStateChanged,
        onJoinStateChanged,
      );
    };
  }, [rtcSession, onJoinStateChanged]);

  return isJoined;
}
