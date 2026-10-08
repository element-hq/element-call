/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  type MatrixRTCSession as JsSdkRTCSession,
  type Status as RTCSessionStatus,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { deepCompare } from "matrix-js-sdk/lib/utils";
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  concat,
  distinctUntilChanged,
  map,
  NEVER,
  type Observable,
  of,
  pairwise,
  race,
  Subject,
  switchMap,
} from "rxjs";

import { type Behavior } from "../reactive/Behavior";
import { type ObservableScope } from "../reactive/ObservableScope";
import { type DelayedLeaveTimings, type SessionTimings } from "../config";
import { type DisconnectReason } from "../api";
import {
  type MatrixRTCError,
  MembershipManagerError,
  toMatrixRTCError,
} from "../errors";
import {
  type LocalMediaBackend,
  type MediaBackend,
  MediaConnectionState,
  type TransportCapabilities,
} from "../media-backend/api";
import { type HomeserverConnected } from "./HomeserverConnected";

export enum TransportState {
  Waiting = "transport_waiting",
}

export enum PublishState {
  WaitingForUser = "publish_waiting_for_user",
  Publishing = "publish_publishing",
}

export type LocalMemberMediaState =
  | { connection: MediaConnectionState | MatrixRTCError }
  | PublishState
  | MatrixRTCError;

export type LocalMemberState =
  | MatrixRTCError
  | TransportState.Waiting
  | { media: LocalMemberMediaState; matrix: MatrixRTCError | RTCSessionStatus };

/** The local transport, found and prepared, with what the join needs to know about it. */
export interface PreparedTransport extends TransportCapabilities {
  transport: Transport;
}

interface Props {
  scope: ObservableScope;
  local: LocalMediaBackend;
  delegateDelayedLeave: MediaBackend["delegateDelayedLeave"];
  preparedTransport$: Observable<PreparedTransport>;
  homeserverConnected: HomeserverConnected;
  joinMatrixRTC: (
    transport: Transport,
    delayedLeave: DelayedLeaveTimings,
  ) => void;
  /** The membership manager giving up on keeping the membership alive. */
  membershipManagerError$: Observable<unknown>;
  matrixRTCSession: Pick<JsSdkRTCSession, "leaveRoomSession">;
  /** The id of the delayed leave event, for the backend to take over. */
  delayId$: Behavior<string | null>;
  timings: SessionTimings;
  logger: Logger;
}

export interface LocalMembership {
  /** Sends the leave and stops publishing. Final: there is no joining again. */
  leave: () => void;
  state$: Behavior<LocalMemberState>;
  /** Fully connected: to the homeserver, the session and the transport. */
  connected$: Behavior<boolean>;
  /** Connected once, and currently not. */
  reconnecting$: Behavior<boolean>;
  disconnectReason$: Behavior<DisconnectReason | null>;
}

/**
 * The local member's state machine: waits for the transport, then publishes
 * and enters the MatrixRTC session, and leaves both in step on `leave()`.
 */
export function createLocalMembership$({
  scope,
  local,
  delegateDelayedLeave,
  preparedTransport$: preparedTransportWithErrors$,
  homeserverConnected,
  joinMatrixRTC,
  membershipManagerError$,
  matrixRTCSession,
  delayId$,
  timings,
  logger: parentLogger,
}: Props): LocalMembership {
  const logger = parentLogger.getChild("[LocalMember]");

  const fatalTransportError$ = new Subject<MatrixRTCError>();
  const preparedTransport$ = preparedTransportWithErrors$.pipe(
    catchError((e: unknown) => {
      fatalTransportError$.next(toMatrixRTCError(e));
      return NEVER;
    }),
  );
  const transport$ = scope.behavior<PreparedTransport | null>(
    preparedTransport$,
    null,
  );

  const joined$ = new BehaviorSubject(true);
  const matrixError$ = new BehaviorSubject<MatrixRTCError | null>(null);

  // Nothing leaves this device while it may already have been dropped from
  // the session: the member would show as away while still being heard
  combineLatest(
    [joined$, homeserverConnected.combined$],
    (joined, [connected]) => joined && connected,
  )
    .pipe(distinctUntilChanged(), scope.bind())
    .subscribe((publish) => local.setPublishing(publish));

  scope.reconcile(
    scope.behavior(combineLatest([transport$, joined$])),
    async ([prepared, joined]) => {
      if (prepared === null || !joined) return;
      try {
        joinMatrixRTC(
          prepared.transport,
          prepared.canDelegateDelayedLeave
            ? timings.delegatedDelayedLeave
            : timings.delayedLeave,
        );
      } catch (e) {
        logger.error("Failed to enter the session", e);
        if (matrixError$.value === null) matrixError$.next(toMatrixRTCError(e));
      }
      return Promise.resolve(async (): Promise<void> => {
        try {
          await matrixRTCSession.leaveRoomSession(1000);
        } catch (e) {
          logger.error("Failed to leave the session", e);
        }
      });
    },
  );

  scope.reconcile(
    scope.behavior(combineLatest([transport$, delayId$])),
    async ([prepared, delayId]) => {
      if (!prepared?.canDelegateDelayedLeave || delayId === null) return;
      try {
        await delegateDelayedLeave(delayId);
      } catch (e) {
        logger.error("Failed to delegate the leave", e);
      }
    },
  );

  membershipManagerError$.pipe(scope.bind()).subscribe((e) => {
    logger.error("The membership manager stopped", e);
    if (matrixError$.value === null)
      matrixError$.next(
        new MembershipManagerError(
          e instanceof Error ? e : new Error(String(e)),
        ),
      );
  });

  const mediaState$ = scope.behavior<LocalMemberMediaState>(
    combineLatest([local.connectionState$, joined$]).pipe(
      map(([connectionState, joined]) => {
        if (connectionState !== MediaConnectionState.Connected)
          return {
            connection:
              connectionState instanceof Error
                ? toMatrixRTCError(connectionState)
                : connectionState,
          };
        return joined ? PublishState.Publishing : PublishState.WaitingForUser;
      }),
      distinctUntilChanged(deepCompare),
    ),
  );

  const state$ = scope.behavior<LocalMemberState>(
    concat(
      of(TransportState.Waiting),
      race(
        fatalTransportError$,
        preparedTransport$.pipe(
          switchMap(() =>
            combineLatest(
              [
                mediaState$,
                homeserverConnected.rtsSession$,
                matrixError$,
                local.publishError$,
              ],
              (media, sessionStatus, matrixError, publishError) => ({
                matrix: matrixError ?? sessionStatus,
                media: publishError ? toMatrixRTCError(publishError) : media,
              }),
            ),
          ),
        ),
      ),
    ),
  );

  const disconnectReason$ = scope.behavior(
    combineLatest(
      [homeserverConnected.combined$, local.connectionState$],
      (
        [homeserverConnected, reason],
        connectionState,
      ): DisconnectReason | null => {
        if (!homeserverConnected) return reason ?? "sync";
        if (connectionState !== MediaConnectionState.Connected) return "media";
        return null;
      },
    ),
  );

  const connected$ = scope.behavior(
    disconnectReason$.pipe(map((reason) => reason === null)),
  );

  const reconnecting$ = scope.behavior(
    connected$.pipe(
      pairwise(),
      map(([was, is]) => was && !is),
    ),
    false,
  );

  return {
    leave: () => joined$.next(false),
    state$,
    connected$,
    reconnecting$,
    disconnectReason$,
  };
}
