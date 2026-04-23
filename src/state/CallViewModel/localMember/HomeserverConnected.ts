/*
Copyright 2025 Element Creations Ltd.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  MembershipManagerEvent,
  Status,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { ClientEvent, type MatrixClient, SyncState } from "matrix-js-sdk";
import {
  fromEvent,
  startWith,
  map,
  tap,
  type Observable,
  distinctUntilChanged,
  switchMap,
  of,
  delay,
} from "rxjs";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { Config } from "../../../config/Config";
import { type ObservableScope } from "../../ObservableScope";
import { type Behavior } from "../../Behavior";
import { and$ } from "../../../utils/observable";
import { type NodeStyleEventEmitter } from "../../../utils/test";

/**
 * Logger instance (scoped child) for homeserver connection updates.
 */
const logger = rootLogger.getChild("[HomeserverConnected]");

export interface HomeserverConnected {
  combined$: Behavior<boolean>;
  rtsSession$: Behavior<Status>;
}

/**
 * Behavior representing whether we consider ourselves connected to the Matrix homeserver
 * for the purposes of a MatrixRTC session.
 *
 * Becomes FALSE if ANY sub-condition is fulfilled:
 * 1. Sync loop is not in SyncState.Syncing (after grace period)
 * 2. membershipStatus !== Status.Connected
 * 3. probablyLeft === true
 *
 * @param scope - The observable scope for lifecycle management.
 * @param client - The Matrix client to monitor sync state.
 * @param matrixRTCSession - The RTC session to monitor membership.
 * @param gracePeriodMs - Grace period in milliseconds to wait before reporting sync disconnect.
 *                        If not provided, uses the config value (default 10000ms).
 */
export function createHomeserverConnected$(
  scope: ObservableScope,
  client: NodeStyleEventEmitter & Pick<MatrixClient, "getSyncState">,
  matrixRTCSession: NodeStyleEventEmitter &
    Pick<MatrixRTCSession, "membershipStatus" | "probablyLeft">,
  gracePeriodMs?: number,
): HomeserverConnected {
  // Get grace period from parameter or config (default 10000ms)
  const graceMs =
    gracePeriodMs ?? Config.get().sync_disconnect_grace_period_ms ?? 10000;

  const syncing$ = (
    fromEvent(client, ClientEvent.Sync) as Observable<[SyncState]>
  ).pipe(
    startWith([client.getSyncState()]),
    map(([state]) => state === SyncState.Syncing),
    distinctUntilChanged(),
    switchMap((isSyncing) => 
{
    if (isSyncing || graceMs <= 0) {
      return of(isSyncing); // Sofortige Emission (Synchron)
    }
    return of(false).pipe(delay(graceMs)); // Verzögertes false
  }    ),
    startWith(client.getSyncState() === SyncState.Syncing),
    distinctUntilChanged(),
  );

  const rtsSession$ = scope.behavior<Status>(
    fromEvent(matrixRTCSession, MembershipManagerEvent.StatusChanged).pipe(
      map(() => matrixRTCSession.membershipStatus ?? Status.Unknown),
    ),
    Status.Unknown,
  );

  const membershipConnected$ = rtsSession$.pipe(
    map((status) => status === Status.Connected),
  );

  // This is basically notProbablyLeft$
  //
  // probablyLeft is computed by a local timer that mimics the server delayed event.
  // If we locally predict our server event timed out. We consider ourselves as probablyLeft
  // even though we might not yet have received the delayed event leave.
  //
  // If that is not the case we certainly still have a valid membership on the matrix network
  // independet if the sync currently works.
  const certainlyConnected$ = fromEvent(
    matrixRTCSession,
    MembershipManagerEvent.ProbablyLeft,
  ).pipe(
    startWith(null),
    map(() => matrixRTCSession.probablyLeft !== true),
  );

  const combined$ = scope.behavior(
    and$(syncing$, membershipConnected$, certainlyConnected$).pipe(
      tap((connected) => {
        logger.info(`Homeserver connected update: ${connected}`);
      }),
    ),
  );

  return { combined$, rtsSession$ };
}
