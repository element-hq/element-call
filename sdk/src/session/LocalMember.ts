/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LocalParticipant,
  type ScreenShareCaptureOptions,
} from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  type LivekitTransport,
  type MatrixRTCSession as JsSdkRTCSession,
  type Status as RTCSessionStatus,
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

import { type Behavior } from "../../../src/state/Behavior";
import { type ObservableScope } from "../../../src/state/ObservableScope";
import { type HomeserverConnected } from "../../../src/state/CallViewModel/localMember/HomeserverConnected";
import { observeSharingScreen$ } from "../../../src/state/CallViewModel/localMember/LocalMember";
import {
  type Connection,
  ConnectionState,
} from "../../../src/state/CallViewModel/remoteMembers/Connection";
import { type IConnectionManager } from "../../../src/state/CallViewModel/remoteMembers/ConnectionManager";
import { type MatrixRTCError } from "../api";
import { toMatrixRTCError } from "../utils/errors";
import { type LocalTransport } from "./LocalTransport";
import { type Publisher } from "./Publisher";

export enum TransportState {
  Waiting = "transport_waiting",
}

export enum PublishState {
  WaitingForUser = "publish_waiting_for_user",
  Publishing = "publish_publishing",
}

export type LocalMemberMediaState =
  | { connection: ConnectionState | MatrixRTCError }
  | PublishState
  | MatrixRTCError;

export type LocalMemberState =
  | MatrixRTCError
  | TransportState.Waiting
  | {
      media: LocalMemberMediaState;
      matrix: MatrixRTCError | RTCSessionStatus;
    };

interface Props {
  scope: ObservableScope;
  connectionManager: IConnectionManager;
  localTransport$: Observable<LocalTransport>;
  homeserverConnected: HomeserverConnected;
  createPublisher: (connection: Connection) => Publisher;
  joinMatrixRTC: (transport: LivekitTransport) => void;
  /** The membership manager giving up on keeping the membership alive. */
  membershipManagerError$: Observable<unknown>;
  matrixRTCSession: Pick<
    JsSdkRTCSession,
    "updateCallIntent" | "leaveRoomSession"
  >;
  cameraEnabled$: Behavior<boolean>;
  logger: Logger;
}

export interface LocalMembership {
  requestJoinAndPublish: () => void;
  requestDisconnect: () => void;
  joinRequested$: Behavior<boolean>;
  state$: Behavior<LocalMemberState>;
  participant$: Behavior<LocalParticipant | null>;
  connection$: Behavior<Connection | null>;
  /** Fully connected: to the homeserver, the session and the transport. */
  connected$: Behavior<boolean>;
  /** Connected once, and currently not. */
  reconnecting$: Behavior<boolean>;
  sharingScreen$: Behavior<boolean>;
  toggleScreenSharing: (() => void) | null;
  screenShareError$: Behavior<Error | null>;
  dismissScreenShareError: () => void;
}

/**
 * The local member's state machine: waits for the transport, publishes on
 * its connection once asked to join, and enters and leaves the MatrixRTC
 * session in step.
 */
export function createLocalMembership$({
  scope,
  connectionManager,
  localTransport$: localTransportWithErrors$,
  homeserverConnected,
  createPublisher,
  joinMatrixRTC,
  membershipManagerError$,
  matrixRTCSession,
  cameraEnabled$,
  logger: parentLogger,
}: Props): LocalMembership {
  const logger = parentLogger.getChild("[LocalMember]");

  const fatalTransportError$ = new Subject<MatrixRTCError>();
  const localTransport$ = localTransportWithErrors$.pipe(
    catchError((e: unknown) => {
      fatalTransportError$.next(toMatrixRTCError(e));
      return NEVER;
    }),
  );
  const transport$ = scope.behavior<LocalTransport | null>(
    localTransport$,
    null,
  );

  const connection$ = scope.behavior(
    combineLatest([
      connectionManager.connectionManagerData$,
      localTransport$,
    ]).pipe(
      map(([{ value: connections }, { transport }]) =>
        connections.getConnectionForTransport(transport),
      ),
    ),
    null,
  );

  const joinRequested$ = new BehaviorSubject(false);
  const publisher$ = new BehaviorSubject<Publisher | null>(null);
  const publishError$ = new BehaviorSubject<MatrixRTCError | null>(null);
  const matrixError$ = new BehaviorSubject<MatrixRTCError | null>(null);

  scope.reconcile(connection$, async (connection) => {
    if (connection === null) return;
    const publisher = createPublisher(connection);
    publisher$.next(publisher);
    return Promise.resolve(async (): Promise<void> => {
      publisher$.next(null);
      await publisher.destroy();
    });
  });

  scope.reconcile(
    scope.behavior(combineLatest([publisher$, joinRequested$])),
    async ([publisher, shouldPublish]) => {
      if (publisher === null) return;
      try {
        if (shouldPublish) {
          publisher.createAndSetupTracks();
          await publisher.startPublishing();
        } else if (publisher.shouldPublish) await publisher.stopPublishing();
      } catch (e) {
        if (publishError$.value === null)
          publishError$.next(toMatrixRTCError(e));
        else logger.error("Another publish error", e);
      }
    },
  );

  scope.reconcile(
    scope.behavior(combineLatest([transport$, joinRequested$])),
    async ([transport, shouldJoin]) => {
      if (transport === null || !shouldJoin) return;
      try {
        joinMatrixRTC(transport.transport);
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

  membershipManagerError$.pipe(scope.bind()).subscribe((e) => {
    logger.error("The membership manager stopped", e);
    if (matrixError$.value === null) matrixError$.next(toMatrixRTCError(e));
  });

  cameraEnabled$.pipe(scope.bind()).subscribe((videoEnabled) => {
    matrixRTCSession
      .updateCallIntent(videoEnabled ? "video" : "audio")
      .catch((e) => {
        // Expected before the join: the intent is sent with it instead
        if (e instanceof Error && e.message === "Not connected yet") return;
        logger.error("Failed to update the call intent", e);
      });
  });

  const connectionState$ = connection$.pipe(
    switchMap((connection) => connection?.state$ ?? of(null)),
  );

  const mediaState$ = scope.behavior<LocalMemberMediaState>(
    combineLatest([connectionState$, joinRequested$]).pipe(
      map(([connectionState, shouldPublish]) => {
        if (connectionState !== ConnectionState.LivekitConnected)
          return {
            connection:
              connectionState instanceof Error
                ? toMatrixRTCError(connectionState)
                : (connectionState ?? ConnectionState.Initialized),
          };
        return shouldPublish
          ? PublishState.Publishing
          : PublishState.WaitingForUser;
      }),
      distinctUntilChanged(deepCompare),
    ),
  );

  const state$ = scope.behavior<LocalMemberState>(
    concat(
      of(TransportState.Waiting),
      race(
        fatalTransportError$,
        localTransport$.pipe(
          switchMap(() =>
            combineLatest(
              [
                mediaState$,
                homeserverConnected.rtsSession$,
                matrixError$,
                publishError$,
              ],
              (media, sessionStatus, matrixError, publishError) => ({
                matrix: matrixError ?? sessionStatus,
                media: publishError ?? media,
              }),
            ),
          ),
        ),
      ),
    ),
  );

  const connected$ = scope.behavior(
    combineLatest(
      [homeserverConnected.combined$, connectionState$],
      ([homeserverConnected], connectionState) =>
        homeserverConnected &&
        connectionState === ConnectionState.LivekitConnected,
    ),
  );

  const reconnecting$ = scope.behavior(
    connected$.pipe(
      pairwise(),
      map(([was, is]) => was && !is),
    ),
    false,
  );

  const participant$ = scope.behavior(
    connection$.pipe(map((c) => c?.livekitRoom.localParticipant ?? null)),
  );

  // Nothing leaves this device while it may already have been dropped from
  // the session: the member would show as away while still being heard
  combineLatest([participant$, homeserverConnected.combined$])
    .pipe(scope.bind())
    .subscribe(([participant, [connected]]) => {
      if (participant === null) return;
      for (const { track } of participant.trackPublications.values()) {
        if (!track) continue;
        if (connected && track.isUpstreamPaused)
          track.resumeUpstream().catch((e) => {
            logger.error(`Failed to resume the ${track.kind} track`, e);
          });
        else if (!connected && !track.isUpstreamPaused)
          track.pauseUpstream().catch((e) => {
            logger.error(`Failed to pause the ${track.kind} track`, e);
          });
      }
    });

  const sharingScreen$ = scope.behavior(
    participant$.pipe(
      switchMap((p) => (p === null ? of(false) : observeSharingScreen$(p))),
    ),
  );
  const screenShareError$ = new BehaviorSubject<Error | null>(null);
  const toggleScreenSharing =
    "getDisplayMedia" in (navigator.mediaDevices ?? {})
      ? (): void => {
          const participant = participant$.value;
          if (participant === null) return;
          const enable = !sharingScreen$.value;
          participant
            .setScreenShareEnabled(enable, screenShareCaptureOptions)
            .catch((e: unknown) => {
              logger.error(
                `Screen share ${enable ? "start" : "stop"} failed`,
                e,
              );
              // The user closing the picker is not an error worth showing
              if (e instanceof DOMException && e.name === "NotAllowedError")
                return;
              screenShareError$.next(
                e instanceof Error ? e : new Error(String(e)),
              );
            });
        }
      : null;

  return {
    requestJoinAndPublish: () => joinRequested$.next(true),
    requestDisconnect: () => joinRequested$.next(false),
    joinRequested$,
    state$,
    participant$,
    connection$,
    connected$,
    reconnecting$,
    sharingScreen$,
    toggleScreenSharing,
    screenShareError$,
    dismissScreenShareError: () => screenShareError$.next(null),
  };
}

const screenShareCaptureOptions: ScreenShareCaptureOptions = {
  // No echo cancellation: it would cancel the other members' voices out of
  // the shared audio
  audio: {
    autoGainControl: false,
    noiseSuppression: false,
    voiceIsolation: false,
  },
  selfBrowserSurface: "include",
  surfaceSwitching: "include",
  systemAudio: "include",
};
