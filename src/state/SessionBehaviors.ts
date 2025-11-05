/*
Copyright 2025 New Vector Ltd.

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
import { fromEvent, map } from "rxjs";

import { type ObservableScope } from "./ObservableScope";
import { type Behavior } from "./Behavior";

interface Props {
  scope: ObservableScope;
  matrixRTCSession: MatrixRTCSession;
}

/**
 * Wraps behaviors that we extract from an matrixRTCSession.
 */
interface RxRtcSession {
  /**
   * some prop
   */
  memberships$: Behavior<CallMembership[]>;
  membershipsWithTransport$: Behavior<
    { membership: CallMembership; transport?: LivekitTransport }[]
  >;
  transports$: Behavior<LivekitTransport[]>;
}

export const sessionBehaviors$ = ({
  scope,
  matrixRTCSession,
}: Props): RxRtcSession => {
  const memberships$ = scope.behavior(
    fromEvent(
      matrixRTCSession,
      MatrixRTCSessionEvent.MembershipsChanged,
      (_, memberships: CallMembership[]) => memberships,
    ),
  );
  /**
   * Lists the transports used by ourselves, plus all other MatrixRTC session
   * members. For completeness this also lists the preferred transport and
   * whether we are in multi-SFU mode or sticky events mode (because
   * advertisedTransport$ wants to read them at the same time, and bundling data
   * together when it might change together is what you have to do in RxJS to
   * avoid reading inconsistent state or observing too many changes.)
   */
  const membershipsWithTransport$: Behavior<
    { membership: CallMembership; transport?: LivekitTransport }[]
  > = scope.behavior(
    memberships$.pipe(
      map((memberships) => {
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
      map((mts) => mts.flatMap(({ transport: t }) => (t ? [t] : []))),
    ),
  );
  return {
    memberships$,
    membershipsWithTransport$,
    transports$,
  };
};
