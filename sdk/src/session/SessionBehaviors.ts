/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { fromEvent } from "rxjs";

import {
  Epoch,
  trackEpoch,
  type ObservableScope,
} from "../reactive/ObservableScope";
import { type Behavior } from "../reactive/Behavior";

export const createMemberships$ = (
  scope: ObservableScope,
  matrixRTCSession: MatrixRTCSession,
): Behavior<Epoch<CallMembership[]>> => {
  return scope.behavior(
    fromEvent(
      matrixRTCSession,
      MatrixRTCSessionEvent.MembershipsChanged,
      (_, memberships: CallMembership[]) => memberships,
    ).pipe(trackEpoch()),
    new Epoch(matrixRTCSession.memberships),
  );
};

/**
 * Whether the session has grown large enough that MatrixRTC has stopped rotating the media
 * encryption key. While this is true the key in use is still shared with new joiners, but no new
 * key is generated when someone joins or leaves.
 */
export const createKeyRotationSuppressed$ = (
  scope: ObservableScope,
  matrixRTCSession: MatrixRTCSession,
): Behavior<boolean> => {
  return scope.behavior(
    fromEvent(
      matrixRTCSession,
      MatrixRTCSessionEvent.KeyRotationSuppressedChanged,
      (suppressed: boolean) => suppressed,
    ),
    matrixRTCSession.isKeyRotationSuppressed,
  );
};
