/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
  isUnstableLivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { fromEvent } from "rxjs";

import {
  Epoch,
  mapEpoch,
  trackEpoch,
  type ObservableScope,
} from "./ObservableScope";
import { type Behavior } from "./Behavior";
import { type TransportLocator } from "../livekit/auth";

/**
 * Tracks the transports used by ourselves, plus all other MatrixRTC session
 * members.
 */
export const membershipsAndTransports$ = (
  scope: ObservableScope,
  memberships$: Behavior<Epoch<CallMembership[]>>,
): {
  membershipsWithTransport$: Behavior<
    Epoch<
      { membership: CallMembership; transport: TransportLocator | undefined }[]
    >
  >;
  transports$: Behavior<Epoch<TransportLocator[]>>;
} => {
  const membershipsWithTransport$: Behavior<
    Epoch<
      { membership: CallMembership; transport: TransportLocator | undefined }[]
    >
  > = scope.behavior(
    memberships$.pipe(
      mapEpoch((memberships) => {
        return memberships.map((membership) => {
          const transport = membership.getTransport();
          return {
            membership,
            transport: isUnstableLivekitTransport(transport)
              ? {
                  transport,
                  serverName: membership.userId.replace(/^.*?:/, ""),
                }
              : undefined,
          };
        });
      }),
    ),
  );

  const transports$: Behavior<Epoch<TransportLocator[]>> = scope.behavior(
    membershipsWithTransport$.pipe(
      mapEpoch((mts) => mts.flatMap(({ transport: t }) => (t ? [t] : []))),
    ),
  );

  return {
    membershipsWithTransport$,
    transports$,
  };
};

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
