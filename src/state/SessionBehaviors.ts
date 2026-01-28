/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CallMembership,
  type LivekitTransportConfig,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
  isLivekitTransportConfig,
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
    Epoch<{ membership: CallMembership; transport?: LivekitTransportConfig }[]>
  >;
  transports$: Behavior<Epoch<LivekitTransportConfig[]>>;
} => {
  /**
   * Lists the transports used by ourselves, plus all other MatrixRTC session
   * members.
   * For completeness this also lists the preferred transport and
   * whether we are in multi-SFU mode or sticky events mode.
   * `advertisedTransport$` reads these values together, so bundling them avoids inconsistent state or
   * excessive updates when using RxJS.
   */
  const membershipsWithTransport$: Behavior<
    Epoch<
      {
        membership: CallMembership;
        transport: LivekitTransportConfig | undefined;
      }[]
    >
  > = scope.behavior(
    memberships$.pipe(
      mapEpoch((memberships) => {
        return memberships.map((membership) => {
          const oldestMembership = memberships[0] ?? membership;
          const transport = membership.getTransport(oldestMembership);
          return {
            membership,
            transport: isLivekitTransportConfig(transport)
              ? transport
              : undefined,
          };
        });
      }),
    ),
  );

  const transports$: Behavior<Epoch<LivekitTransportConfig[]>> = scope.behavior(
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
