/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  isLivekitTransport,
  type LivekitTransport,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/lib/matrixrtc";
import { fromEvent } from "rxjs";

import {
  Epoch,
  mapEpoch,
  trackEpoch,
  type ObservableScope,
} from "./ObservableScope";
import { type Behavior } from "./Behavior";

export const membershipsAndTransports$ = (
  scope: ObservableScope,
  memberships$: Behavior<Epoch<CallMembership[]>>,
): {
  membershipsWithTransport$: Behavior<
    Epoch<{ membership: CallMembership; transport?: LivekitTransport }[]>
  >;
  transports$: Behavior<Epoch<LivekitTransport[]>>;
} => {
  /**
   * Lists the transports used by ourselves, plus all other MatrixRTC session
   * members. For completeness this also lists the preferred transport and
   * whether we are in multi-SFU mode or sticky events mode (because
   * advertisedTransport$ wants to read them at the same time, and bundling data
   * together when it might change together is what you have to do in RxJS to
   * avoid reading inconsistent state or observing too many changes.)
   */
  const membershipsWithTransport$ = scope.behavior(
    memberships$.pipe(
      mapEpoch((memberships) => {
        return memberships.map((membership) => {
          const oldestMembership = memberships[0] ?? membership;
          const transport = membership.getTransport(oldestMembership);
          return {
            membership,
            transport: isLivekitTransport(transport) ? transport : undefined,
          };
        });
      }),
    ),
  );

  const transports$ = scope.behavior(
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
