/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  pairwise,
  tap,
} from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../../Behavior.ts";
import { type ObservableScope } from "../../ObservableScope.ts";
import { type MuteStates } from "../../MuteStates.ts";
import { type HostBridge } from "../../../HostBridge.ts";
import {
  ElementCallError,
  MembershipManagerError,
} from "../../../utils/errors.ts";
import { PosthogAnalytics } from "../../../analytics/PosthogAnalytics.ts";
import {
  FfiImpairment,
  FfiKeepAlive,
  FfiStatus,
  type FfiConnectionWithMembers,
  type FfiJoinParams,
  type FfiStatus as FfiStatusType,
  type FfiTransportIntent,
} from "../../../matrix-rtc-sdk";
import { type SlotPolicy } from "../../rtc/CallParticipation.ts";
import { type DisconnectContext, errorForStatus } from "../../rtc/errors.ts";
import { publishOnLivekit } from "../../rtc/transportIntent.ts";
import { type IConnectionManager } from "../remoteMembers/ConnectionManager.ts";
import {
  ConnectionState,
  type Connection,
} from "../remoteMembers/Connection.ts";
import { type Publisher } from "./Publisher.ts";
import { createLocalMedia$ } from "./LocalMedia.ts";
import {
  type LocalMembership,
  type LocalMemberState,
  MatrixConnectionStatus,
  TransportState,
} from "./LocalMember.ts";
import { type HomeserverDisconnectReason } from "./HomeserverConnected.ts";

/** What our own membership needs from a {@link CallParticipation}. */
export interface ParticipationLocalMemberSource {
  status$: Behavior<FfiStatusType>;
  connections$: Behavior<FfiConnectionWithMembers[]>;
  ownMemberId$: Behavior<string | null>;
  join(
    intent: FfiTransportIntent,
    params: FfiJoinParams,
    slot: SlotPolicy,
  ): Promise<void>;
  leave(): Promise<void>;
  updateApplication(intent: string | undefined): Promise<void>;
}

interface Props {
  scope: ObservableScope;
  participation: ParticipationLocalMemberSource;
  connectionManager: IConnectionManager;
  createPublisherFactory: (connection: Connection) => Publisher;
  muteStates: MuteStates;
  /** Whether to hide the screen-sharing button. */
  hideScreensharing: boolean;
  /** The application hosting Element Call, to be kept informed of join/leave. */
  hostBridge: HostBridge;
  /** How to join, from the configuration. */
  joinParams: FfiJoinParams;
  /** Whether the room's slot may be opened by us, and how. */
  slotPolicy$: Behavior<SlotPolicy>;
  /**
   * A developer's own LiveKit service URL to publish on instead of whatever
   * the homeserver advertises; null or empty for none.
   */
  customLivekitUrl$: Observable<string | null | undefined>;
  /** For turning a failed participation into the error the UI shows. */
  disconnectContext: () => DisconnectContext;
  /** The room, as the call identifier in analytics events. */
  roomId: string;
  logger: Logger;
}

/**
 * The Matrix side of the call as the crate sees it, reduced to what the local
 * member state needs: connected or not, and if not, why.
 */
interface MatrixConnection {
  connected: boolean;
  reason: HomeserverDisconnectReason | null;
  status: MatrixConnectionStatus;
}

function describeStatus(status: FfiStatusType): MatrixConnection {
  if (FfiStatus.Disconnected.instanceOf(status))
    return {
      connected: false,
      reason: "membership",
      status: MatrixConnectionStatus.Disconnected,
    };
  if (!FfiStatus.Connected.instanceOf(status))
    return {
      connected: false,
      reason: "membership",
      status: MatrixConnectionStatus.Connecting,
    };
  const { impairments, keepAlive } = status.inner;
  if (
    impairments.some((i) => FfiImpairment.HomeserverUnreachable.instanceOf(i))
  )
    return {
      connected: false,
      reason: "sync",
      status: MatrixConnectionStatus.Connected,
    };
  // A keep-alive that cannot be restarted may already have fired: the
  // homeserver may think we left.
  if (
    FfiKeepAlive.RestartFailing.instanceOf(keepAlive) ||
    FfiKeepAlive.Expired.instanceOf(keepAlive)
  )
    return {
      connected: false,
      reason: "probablyLeft",
      status: MatrixConnectionStatus.Connected,
    };
  return {
    connected: true,
    reason: null,
    status: MatrixConnectionStatus.Connected,
  };
}

/**
 * Our own membership over a {@link CallParticipation}: the crate publishes
 * and keeps alive the membership, discovers the transport and mints its
 * token; this joins and leaves when the user asks, publishes our media on
 * the connection the crate gave us, and projects the crate's status onto the
 * connected / reconnecting / error states the call UI shows.
 */
export const createParticipationLocalMembership$ = ({
  scope,
  participation,
  connectionManager,
  createPublisherFactory,
  muteStates,
  hideScreensharing,
  hostBridge,
  joinParams,
  slotPolicy$,
  customLivekitUrl$,
  disconnectContext,
  roomId,
  logger: parentLogger,
}: Props): LocalMembership => {
  const logger = parentLogger.getChild("[ParticipationLocalMembership]");
  logger.debug(`Creating local membership..`);

  // The connection we publish on: the one the crate lists our own member on.
  const ownServiceUrl$ = scope.behavior(
    combineLatest([
      participation.connections$,
      participation.ownMemberId$,
    ]).pipe(
      map(
        ([connections, ownMemberId]) =>
          connections.find((c) =>
            c.members.some((m) => m.memberId === ownMemberId),
          )?.connection.serviceUrl ?? null,
      ),
      distinctUntilChanged(),
    ),
  );

  const localConnection$ = scope.behavior(
    combineLatest([
      connectionManager.connectionManagerData$,
      ownServiceUrl$,
    ]).pipe(
      map(([{ value: connectionData }, serviceUrl]) =>
        serviceUrl === null
          ? null
          : connectionData.getConnectionForTransport({
              type: "livekit",
              livekit_service_url: serviceUrl,
            }),
      ),
      tap((connection) => {
        logger.info(
          `Local connection updated: ${connection?.transport?.livekit_service_url}`,
        );
      }),
    ),
  );

  const matrixConnection$ = scope.behavior(
    participation.status$.pipe(
      map(describeStatus),
      distinctUntilChanged(
        (a, b) =>
          a.connected === b.connected &&
          a.reason === b.reason &&
          a.status === b.status,
      ),
    ),
  );

  const {
    startTracks,
    requestJoinAndPublish,
    requestDisconnect,
    joinAndPublishRequested$,
    participant$,
    localConnectionState$,
    mediaState$,
    publishError$,
    sharingScreen$,
    toggleScreenSharing,
    screenShareError$,
    dismissScreenShareError,
  } = createLocalMedia$({
    scope,
    localConnection$,
    transportReady$: scope.behavior(
      ownServiceUrl$.pipe(map((url) => url !== null)),
    ),
    matrixConnected$: matrixConnection$.pipe(map((c) => c.connected)),
    createPublisherFactory,
    hideScreensharing,
    hostBridge,
    logger,
  });

  // MATRIX RELATED

  const fatalMatrixError$ = new BehaviorSubject<ElementCallError | null>(null);
  const setMatrixError = (e: ElementCallError): void => {
    if (fatalMatrixError$.value !== null) {
      logger.error("Multiple Matrix Errors:", e);
    } else {
      fatalMatrixError$.next(e);
    }
  };

  // Join and leave as the user asks. The crate does the rest: it opens the
  // slot when we may, discovers the transport, publishes and keeps the
  // membership alive, and delegates the delayed leave.
  scope.reconcile(
    scope.behavior(
      combineLatest([joinAndPublishRequested$, customLivekitUrl$]),
    ),
    async ([shouldConnect, customLivekitUrl]) => {
      // if shouldConnect=false we will do the disconnect as the cleanup from the previous reconcile iteration.
      if (!shouldConnect) return;
      PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
      PosthogAnalytics.instance.eventCallStarted.track(roomId);
      try {
        await participation.join(
          publishOnLivekit(customLivekitUrl || undefined),
          joinParams,
          slotPolicy$.value,
        );
      } catch (error) {
        logger.error("Error joining the session", error);
        setMatrixError(
          error instanceof ElementCallError
            ? error
            : (errorForStatus(
                participation.status$.value,
                disconnectContext(),
              ) ??
                new MembershipManagerError(
                  error instanceof Error ? error : new Error(String(error)),
                )),
        );
      }

      return Promise.resolve(async (): Promise<void> => {
        try {
          await participation.leave();
        } catch (e) {
          logger.error("Error leaving the session", e);
        }
      });
    },
  );

  // The crate can end the participation on its own (the slot closed, the
  // manager stopped): while the user still wants to be in the call, that is
  // an error to show.
  combineLatest([participation.status$, joinAndPublishRequested$])
    .pipe(scope.bind())
    .subscribe(([status, shouldConnect]) => {
      if (!shouldConnect) return;
      const error = errorForStatus(status, disconnectContext());
      if (error !== null && fatalMatrixError$.value === null) {
        logger.warn("The participation ended on its own", error);
        setMatrixError(error);
      }
    });

  const localMemberState$ = scope.behavior<LocalMemberState>(
    combineLatest([
      mediaState$,
      matrixConnection$,
      fatalMatrixError$,
      publishError$,
    ]).pipe(
      map(([mediaState, matrixConnection, fatalMatrixError, publishError]) => {
        // `mediaState` will be 'null' until the transport/connection appears.
        if (mediaState)
          return {
            matrix: fatalMatrixError ?? matrixConnection.status,
            media: publishError ?? mediaState,
          };
        // A join that failed before any transport was known is still fatal.
        if (fatalMatrixError) return fatalMatrixError;
        return TransportState.Waiting;
      }),
    ),
  );

  /**
   * The disconnect reason for the combined Matrix + LiveKit connection, or null
   * when fully connected. Homeserver reasons take priority over livekit.
   */
  const connectionDisconnectReason$ = scope.behavior(
    combineLatest([
      matrixConnection$,
      localConnectionState$.pipe(
        map((state) => state === ConnectionState.LivekitConnected),
      ),
    ]).pipe(
      map(([matrix, livekitConnected]) => {
        if (!matrix.connected) return matrix.reason!;
        if (!livekitConnected) return "livekit" as const;
        return null;
      }),
      tap((v) => logger.debug("livekit+matrix: Connected state changed", v)),
    ),
  );

  /**
   * Whether we are "fully" connected to the call. Accounts for both the
   * connection to the MatrixRTC session and the LiveKit publish connection.
   */
  const matrixAndLivekitConnected$ = scope.behavior(
    connectionDisconnectReason$.pipe(map((reason) => reason === null)),
  );

  /**
   * Whether we should tell the user that we're reconnecting to the call.
   */
  const reconnecting$ = scope.behavior(
    matrixAndLivekitConnected$.pipe(
      pairwise(),
      map(([prev, current]) => prev === true && current === false),
    ),
    false,
  );

  let reconnectStart: {
    time: number;
    reason: NonNullable<(typeof connectionDisconnectReason$)["value"]>;
  } | null = null;
  connectionDisconnectReason$
    .pipe(distinctUntilChanged(), pairwise(), scope.bind())
    .subscribe(([prev, reason]) => {
      if (reason !== null) {
        // Only begin tracking when transitioning FROM connected (null → non-null).
        if (prev === null) {
          reconnectStart ??= { time: Date.now(), reason };
        }
      } else if (reconnectStart !== null) {
        PosthogAnalytics.instance.eventCallReconnecting.track(
          roomId,
          reconnectStart.reason,
          (Date.now() - reconnectStart.time) / 1000,
        );
        PosthogAnalytics.instance.eventCallEnded.cacheReconnecting(
          reconnectStart.reason,
        );
        reconnectStart = null;
      }
    });

  // The call intent follows the camera (C11). Before the join the crate
  // refuses, which is expected.
  muteStates.video.enabled$.pipe(scope.bind()).subscribe((videoEnabled) => {
    participation
      .updateApplication(videoEnabled ? "video" : "audio")
      .catch((e) => {
        logger.debug(
          "Could not update the call intent (expected before the join)",
          e,
        );
      });
  });

  return {
    startTracks,
    requestJoinAndPublish,
    requestDisconnect,
    localMemberState$,
    participant$,
    reconnecting$,
    connected$: matrixAndLivekitConnected$,
    disconnected$: scope.behavior(
      matrixConnection$.pipe(
        map((c) => c.status === MatrixConnectionStatus.Disconnected),
      ),
    ),
    sharingScreen$,
    toggleScreenSharing,
    screenShareError$,
    dismissScreenShareError,
    connection$: localConnection$,
    internalLoggerRef: logger,
  };
};
