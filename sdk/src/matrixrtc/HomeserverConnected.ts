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
  combineLatest,
} from "rxjs";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

import { type ObservableScope } from "../reactive/ObservableScope";
import { type Behavior } from "../reactive/Behavior";
import { defaultSessionTimings } from "../config";
import { type MatrixDisconnectReason } from "../api";

type NodeEventHandler = (...args: unknown[]) => void;

interface NodeStyleEventEmitter {
  addListener(eventName: string | symbol, handler: NodeEventHandler): this;
  removeListener(eventName: string | symbol, handler: NodeEventHandler): this;
}

export interface HomeserverConnected {
  /** Null while the homeserver connection is healthy, the first failing link otherwise. */
  disconnectReason$: Behavior<MatrixDisconnectReason | null>;
}

/**
 * Behavior representing whether we consider ourselves connected to the Matrix homeserver
 * for the purposes of a MatrixRTC session.
 *
 * `disconnectReason$` emits `null` when all conditions are satisfied, or the first failing
 * reason (priority: syncing > membershipConnected > certainlyConnected):
 * 1. Sync loop is not in SyncState.Syncing (after grace period) → "sync"
 * 2. membershipStatus !== Status.Connected → "membership"
 * 3. probablyLeft === true → "probablyLeft"
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
  const logger = rootLogger.getChild("[HomeserverConnected]");
  // Get grace period from parameter or config (default 10000ms)
  const graceMs =
    gracePeriodMs ?? defaultSessionTimings.syncDisconnectGracePeriodMs;

  const syncing$ = (
    fromEvent(client, ClientEvent.Sync) as Observable<[SyncState]>
  ).pipe(
    startWith([client.getSyncState()]),
    map(([state]) => state === SyncState.Syncing),
    distinctUntilChanged(),
    switchMap((isSyncing) => {
      if (isSyncing || graceMs <= 0) {
        return of(isSyncing);
      }
      return of(false).pipe(delay(graceMs), startWith(true));
    }),
    distinctUntilChanged(),
  );

  const rtsSession$ = scope.behavior<Status>(
    fromEvent(matrixRTCSession, MembershipManagerEvent.StatusChanged).pipe(
      map(() => matrixRTCSession.membershipStatus ?? Status.Unknown),
    ),
    matrixRTCSession.membershipStatus ?? Status.Unknown,
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

  const disconnectReason$ = scope.behavior(
    combineLatest([syncing$, membershipConnected$, certainlyConnected$]).pipe(
      map(([syncing, membership, certainly]): MatrixDisconnectReason | null => {
        if (!syncing) return "sync";
        if (!membership) return "membership";
        if (!certainly) return "probablyLeft";
        return null;
      }),
      tap((reason) => {
        logger.info(`Homeserver connected update: ${reason ?? "connected"}`);
      }),
    ),
  );

  return { disconnectReason$ };
}
