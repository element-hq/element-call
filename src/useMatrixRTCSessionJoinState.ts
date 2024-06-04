/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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

  const onJoinStateChanged = useCallback(() => {
    logger.info(
      `Session in room ${rtcSession.room.roomId} changed to ${
        rtcSession.isJoined() ? "joined" : "left"
      }`,
    );
    setJoined(rtcSession.isJoined());
  }, [rtcSession]);

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
