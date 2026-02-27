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
  switchMap,
  timer,
  of,
  distinctUntilChanged,
  type Observable,
} from "rxjs";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

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
 * 1. Sync loop is not in SyncState.Syncing
 * 2. membershipStatus !== Status.Connected
 * 3. probablyLeft === true
 */
export function createHomeserverConnected$(
  scope: ObservableScope,
  client: NodeStyleEventEmitter & Pick<MatrixClient, "getSyncState">,
  matrixRTCSession: NodeStyleEventEmitter &
    Pick<MatrixRTCSession, "membershipStatus" | "probablyLeft">,
): HomeserverConnected {
  const syncingRaw$ = (
    fromEvent(client, ClientEvent.Sync) as Observable<[SyncState]>
  ).pipe(
    startWith([client.getSyncState()]),
    map(([state]) => state === SyncState.Syncing),
    tap((v) => logger.info(`syncing$ (raw): ${v}`)),
  );

  // Sync errors are transient — the SDK auto-retries and /sync abort
  // recoveries can take several seconds. Debounce the false→true transition
  // with an 8s grace period so brief sync interruptions don't cascade.
  const syncing$ = syncingRaw$.pipe(
    switchMap((syncing) =>
      syncing
        ? of(true)
        : timer(8000).pipe(
            map(() => false),
            startWith(true),
          ),
    ),
    distinctUntilChanged(),
    tap((v) => logger.info(`syncing$ (debounced): ${v}`)),
  );

  const rtsSession$ = scope.behavior<Status>(
    fromEvent(matrixRTCSession, MembershipManagerEvent.StatusChanged).pipe(
      map(() => matrixRTCSession.membershipStatus ?? Status.Unknown),
    ),
    Status.Unknown,
  );

  const membershipConnected$ = rtsSession$.pipe(
    map((status) => status === Status.Connected),
    tap((v) => logger.info(`membershipConnected$: ${v}`)),
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
    tap((v) => logger.info(`certainlyConnected$ (notProbablyLeft): ${v}`)),
  );

  const combined$ = scope.behavior(
    and$(syncing$, membershipConnected$, certainlyConnected$).pipe(
      // Don't immediately report disconnection for brief hiccups.
      // Stay "connected" during a 2s grace period so that momentary sync
      // errors or delayed-leave-event timeouts don't flap the UI.
      switchMap((connected) =>
        connected
          ? of(true)
          : timer(2000).pipe(
              map(() => false),
              startWith(true),
            ),
      ),
      distinctUntilChanged(),
      tap((connected) => {
        logger.info(`Homeserver connected update: ${connected}`);
      }),
    ),
  );

  return { combined$, rtsSession$ };
}
