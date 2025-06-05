/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { TypedEventEmitter } from "matrix-js-sdk";
import { useCallback, useEffect } from "react";

import { useTypedEventEmitterState } from "./useEvents";

const dummySession = new TypedEventEmitter();

export function useMatrixRTCSessionJoinState(
  rtcSession: MatrixRTCSession | undefined,
): boolean {
  // React doesn't allow you to run a hook conditionally, so we have to plug in
  // a dummy event emitter in case there is no rtcSession yet
  const isJoined = useTypedEventEmitterState(
    rtcSession ?? dummySession,
    MatrixRTCSessionEvent.JoinStateChanged,
    useCallback(() => rtcSession?.isJoined() ?? false, [rtcSession]),
  );

  useEffect(() => {
    logger.info(
      `Session in room ${rtcSession?.room.roomId} changed to ${
        isJoined ? "joined" : "left"
      }`,
    );
  }, [rtcSession, isJoined]);

  return isJoined;
}
