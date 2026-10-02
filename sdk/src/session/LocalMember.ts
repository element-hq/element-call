/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { observeParticipantEvents } from "@livekit/components-core";
import {
  type LocalParticipant,
  type Participant,
  ParticipantEvent,
  type ScreenShareCaptureOptions,
  Track,
  type TrackPublishOptions,
} from "livekit-client";
import { type MatrixClient } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  type LivekitTransport,
  type MatrixRTCSession as JsSdkRTCSession,
  type Status as RTCSessionStatus,
} from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
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
import {
  type DelayedLeaveTimings,
  type MatrixRTCMode,
  type SessionTimings,
} from "../config";
import { type DisconnectReason, type VideoCaptureSettings } from "../api";
import {
  FailToStartLivekitConnection,
  type MatrixRTCError,
  MembershipManagerError,
  toMatrixRTCError,
} from "../errors";
import { type HomeserverConnected } from "./HomeserverConnected";
import { type Connection, ConnectionState } from "./Connection";
import { type IConnectionManager } from "./ConnectionManager";
import { type LocalTransport } from "./LocalTransport";
import { getSFUConfigWithOpenID } from "./openIDSFU";
import { type DesiredMedia, type Publisher } from "./Publisher";

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
  | { media: LocalMemberMediaState; matrix: MatrixRTCError | RTCSessionStatus };

interface Props {
  scope: ObservableScope;
  connectionManager: IConnectionManager;
  localTransport$: Observable<LocalTransport>;
  homeserverConnected: HomeserverConnected;
  createPublisher: (connection: Connection) => Publisher;
  joinMatrixRTC: (
    transport: LivekitTransport,
    delayedLeave: DelayedLeaveTimings,
  ) => void;
  /** The membership manager giving up on keeping the membership alive. */
  membershipManagerError$: Observable<unknown>;
  matrixRTCSession: Pick<JsSdkRTCSession, "leaveRoomSession">;
  /** The id of the delayed leave event, for the SFU to take over. */
  delayId$: Behavior<string | null>;
  client: Pick<MatrixClient, "getOpenIdToken" | "getDeviceId" | "baseUrl">;
  roomId: string;
  ownMembershipIdentity: CallMembershipIdentityParts;
  matrixRTCMode: MatrixRTCMode;
  timings: SessionTimings;
  desired: DesiredMedia;
  screenShare?: VideoCaptureSettings;
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
  disconnectReason$: Behavior<DisconnectReason | null>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<boolean>;
  setCameraEnabled: (enabled: boolean) => Promise<boolean>;
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
  delayId$,
  client,
  roomId,
  ownMembershipIdentity,
  matrixRTCMode,
  timings,
  desired,
  screenShare,
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

  // Whether the SFU can take over restarting the delayed leave, so that a
  // client that vanishes is removed by the SFU rather than by the timeout.
  // Either the homeserver or the transport has to support it.
  const homeserverSupportsDelegation = checkDelegationSupport(
    `${client.baseUrl}/_matrix/client/unstable/io.element.msc4195/rtc/livekit/delegate_delayed_leave`,
    "homeserver",
    logger,
  );
  const joinParams$ = scope.behavior(
    localTransport$.pipe(
      switchMap(async ({ transport }) => ({
        transport,
        delegationSupported:
          (await homeserverSupportsDelegation) ||
          (await checkDelegationSupport(
            `${transport.livekit_service_url}/delegate_delayed_leave`,
            `transport ${transport.livekit_service_url}`,
            logger,
          )),
      })),
    ),
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
          publishError$.next(
            new FailToStartLivekitConnection(
              e instanceof Error ? e.message : String(e),
            ),
          );
        else logger.error("Another publish error", e);
      }
    },
  );

  scope.reconcile(
    scope.behavior(combineLatest([joinParams$, joinRequested$])),
    async ([joinParams, shouldJoin]) => {
      if (joinParams === null || !shouldJoin) return;
      try {
        joinMatrixRTC(
          joinParams.transport,
          joinParams.delegationSupported
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

  // Hand the delayed leave to the SFU. The token this issues is discarded;
  // the request is what triggers the delegation.
  scope.reconcile(
    scope.behavior(combineLatest([joinParams$, delayId$])),
    async ([joinParams, delayId]) => {
      if (!joinParams?.delegationSupported || delayId === null) return;
      try {
        await getSFUConfigWithOpenID(
          client,
          ownMembershipIdentity,
          joinParams.transport.livekit_service_url,
          roomId,
          {
            matrixRTCMode,
            delayEndpointBaseUrl: client.baseUrl,
            delayId,
            delayTimeoutMs: timings.delegatedDelayedLeave.delay_ms,
          },
          logger,
        );
      } catch (e) {
        logger.error(
          `Failed to delegate the leave to ${joinParams.transport.livekit_service_url}`,
          e,
        );
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

  const disconnectReason$ = scope.behavior(
    combineLatest(
      [homeserverConnected.combined$, connectionState$],
      (
        [homeserverConnected, reason],
        connectionState,
      ): DisconnectReason | null => {
        if (!homeserverConnected) return reason ?? "sync";
        if (connectionState !== ConnectionState.LivekitConnected)
          return "media";
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

  const setEnabled = async (
    source: Track.Source.Microphone | Track.Source.Camera,
    enabled: boolean,
  ): Promise<boolean> => {
    const desired$ =
      source === Track.Source.Microphone
        ? desired.microphone$
        : desired.camera$;
    desired$.next(enabled);
    // Without a publisher the request waits for the tracks to be created
    const publisher = publisher$.value;
    if (publisher === null) return enabled;
    const result = await publisher.setEnabled(source, enabled);
    if (result !== enabled) desired$.next(result);
    return result;
  };

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
            .setScreenShareEnabled(
              enable,
              screenShareCaptureOptions(screenShare),
              screenSharePublishOptions(screenShare),
            )
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
    disconnectReason$,
    setMicrophoneEnabled: async (enabled) =>
      setEnabled(Track.Source.Microphone, enabled),
    setCameraEnabled: async (enabled) =>
      setEnabled(Track.Source.Camera, enabled),
    sharingScreen$,
    toggleScreenSharing,
    screenShareError$,
    dismissScreenShareError: () => screenShareError$.next(null),
  };
}

/**
 * Whether an endpoint exists, by hitting it without credentials and reading
 * the status. Not retried: many servers predate the endpoint altogether and
 * answer with a CORS failure that a retry loop would only repeat.
 */
async function checkDelegationSupport(
  endpointUrl: string,
  serviceName: string,
  logger: Logger,
): Promise<boolean> {
  try {
    const res = await fetch(endpointUrl, { method: "POST" });
    const supported = res.status !== 404;
    logger.info(
      `${serviceName} ${supported ? "supports" : "does not support"} delegation`,
    );
    return supported;
  } catch (e) {
    logger.warn(
      `Failed to determine whether ${serviceName} supports delegation, assuming no support`,
      e,
    );
    return false;
  }
}

function screenShareCaptureOptions(
  settings: VideoCaptureSettings | undefined,
): ScreenShareCaptureOptions {
  return {
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
    ...(settings?.resolution && { resolution: settings.resolution }),
  };
}

function screenSharePublishOptions(
  settings: VideoCaptureSettings | undefined,
): TrackPublishOptions | undefined {
  if (settings === undefined) return undefined;
  return {
    ...(settings.maxBitrate !== undefined && {
      screenShareEncoding: {
        maxBitrate: settings.maxBitrate,
        maxFramerate: settings.maxFramerate,
      },
    }),
    ...(settings.codec && { videoCodec: settings.codec }),
  };
}

function observeSharingScreen$(participant: Participant): Observable<boolean> {
  return observeParticipantEvents(
    participant,
    ParticipantEvent.TrackPublished,
    ParticipantEvent.TrackUnpublished,
    ParticipantEvent.LocalTrackPublished,
    ParticipantEvent.LocalTrackUnpublished,
  ).pipe(map((p) => p.isScreenShareEnabled));
}
