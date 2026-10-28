/*
Copyright 2025 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  connectedParticipantsObserver,
  connectionStateObserver,
} from "@livekit/components-core";
import {
  ConnectionError,
  ConnectionErrorReason,
  type ConnectionState as LivekitConnectionState,
  getBrowser,
  type Participant,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type Room as LivekitRoom,
  RoomEvent,
  type SubscriptionError,
  type Track,
  type TrackPublication,
} from "livekit-client";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import {
  type ClientGetTokenParts,
  type ClientOpenIDParts,
  type ConnectionRole,
  getSFUConfig,
  type SFUConfig,
} from "./auth";
import { type Behavior } from "../../reactive/Behavior";
import { type ObservableScope } from "../../reactive/ObservableScope";
import {
  MatrixRTCError,
  InsufficientCapacityError,
  LivekitConnectionError,
  PeerConnectionTimeoutError,
  SFURoomCreationRestrictedError,
  UnknownRTCError,
} from "../../errors";

export interface ConnectionOpts {
  /** The identity parts to use on this connection */
  ownMembershipIdentity: CallMembershipIdentityParts;
  /** Whether we publish on this connection or only subscribe. */
  role: ConnectionRole;
  /** The media transport to connect to. */
  transport: UnstableLivekitTransport;
  /** The homeserver the transport belongs to. */
  serverName: string;
  /** The Matrix client, for the token exchange. */
  client: ClientGetTokenParts & ClientOpenIDParts;
  /** The Matrix room the session is in. */
  roomId: string;
  /** The MatrixRTC slot the session is in. */
  slotId: string;
  /** The observable scope to use for this connection. */
  scope: ObservableScope;

  /** Optional factory to create the LiveKit room, mainly for testing purposes. */
  livekitRoomFactory: () => LivekitRoom;
}

export type ConnectionState =
  /** Created, nothing started yet. */
  | { state: "initialized" }
  /** `start` was called; the SFU token is being fetched. */
  | { state: "authenticating" }
  /** The token is in hand; the LiveKit room's own state from here. */
  | { state: "authenticated"; livekitState: LivekitConnectionState }
  | { state: "error"; error: MatrixRTCError }
  | { state: "stopped" };

/**
 * A connection to a Matrix RTC LiveKit backend.
 *
 * Expose observables for participants and connection state.
 */
export class Connection {
  // Private Behavior
  private readonly _state$ = new BehaviorSubject<ConnectionState>({
    state: "initialized",
  });

  /**
   * The current state of the connection to the media transport.
   */
  public readonly state$: Behavior<ConnectionState> = this._state$;

  /** Whether we publish on this connection or only subscribe. */
  public readonly role: ConnectionRole;

  /**
   * The media transport to connect to.
   */
  public readonly transport: UnstableLivekitTransport;

  /** The homeserver the transport belongs to. */
  public readonly serverName: string;

  public readonly livekitRoom: LivekitRoom;

  private scope: ObservableScope;

  /**
   * The remote LiveKit participants that are visible on this connection.
   *
   * Note that this may include participants that are connected only to
   * subscribe, or publishers that are otherwise unattested in MatrixRTC state.
   * It is therefore more low-level than what should be presented to the user.
   */
  public readonly remoteParticipants$: Behavior<RemoteParticipant[]>;

  /**
   * The alias of the LiveKit room.
   */
  public get livekitAlias(): string | undefined {
    return this._livekitAlias;
  }
  private _livekitAlias?: string;

  /**
   * Whether the connection has been stopped.
   * @see Connection.stop
   * */
  protected stopped = false;

  private readonly client: ClientGetTokenParts & ClientOpenIDParts;
  private readonly roomId: string;
  private readonly slotId: string;
  private readonly logger: Logger;
  private readonly ownMembershipIdentity: CallMembershipIdentityParts;
  /**
   * Creates a new connection to a matrix RTC LiveKit backend.
   *
   * @param opts - Connection options {@link ConnectionOpts}.
   *
   * @param logger - The logger to use.
   */
  public constructor(opts: ConnectionOpts, logger: Logger) {
    this.ownMembershipIdentity = opts.ownMembershipIdentity;
    this.roomId = opts.roomId;
    this.slotId = opts.slotId;
    this.logger = logger.getChild(
      `[Connection ${JSON.stringify(opts.transport)}]`,
    );
    this.logger.debug(`constructor called`);
    const { role, transport, serverName, client, scope } = opts;

    this.scope = scope;
    this.livekitRoom = opts.livekitRoomFactory();
    this.role = role;
    this.transport = transport;
    this.serverName = serverName;
    this.client = client;

    this.remoteParticipants$ = scope.behavior(
      // Only tracks remote participants
      connectedParticipantsObserver(this.livekitRoom),
    );
    this.logRemoteTrackEvents();

    scope.onEnd(() => {
      this.logger.info(`Connection scope ended, stopping connection`);
      void this.stop();
    });
  }

  /**
   * Logs the lifecycle of remote participants and their tracks as seen by
   * livekit-client, so that rageshakes show what a tile should have been
   * rendering (published, subscribed, muted, paused) for each remote member.
   */
  private logRemoteTrackEvents(): void {
    const room = this.livekitRoom;
    const log = this.logger.getChild("[RemoteTracks]");
    // The encryption flag matters: if the publisher encrypts but this client
    // believes the track is unencrypted, the cryptor is bypassed and raw
    // ciphertext reaches the decoder (audible as loud noise bursts).
    const track = (pub: TrackPublication, p: Participant): string =>
      `${pub.kind} ${pub.source} ${pub.trackSid} of ${p.identity} encrypted=${pub.isEncrypted}`;

    const onParticipantConnected = (p: RemoteParticipant): void =>
      log.info(`Participant connected: ${p.identity} (${p.sid})`);
    const onParticipantDisconnected = (p: RemoteParticipant): void =>
      log.info(`Participant disconnected: ${p.identity} (${p.sid})`);
    const onTrackPublished = (
      pub: RemoteTrackPublication,
      p: RemoteParticipant,
    ): void => log.info(`Published: ${track(pub, p)} muted=${pub.isMuted}`);
    const onTrackUnpublished = (
      pub: RemoteTrackPublication,
      p: RemoteParticipant,
    ): void => log.info(`Unpublished: ${track(pub, p)}`);
    const onTrackSubscribed = (
      _t: Track,
      pub: RemoteTrackPublication,
      p: RemoteParticipant,
    ): void => log.info(`Subscribed: ${track(pub, p)} muted=${pub.isMuted}`);
    const onTrackUnsubscribed = (
      _t: Track,
      pub: RemoteTrackPublication,
      p: RemoteParticipant,
    ): void => log.info(`Unsubscribed: ${track(pub, p)}`);
    const onTrackSubscriptionFailed = (
      trackSid: string,
      p: RemoteParticipant,
      reason?: SubscriptionError,
    ): void =>
      log.warn(
        `Subscription failed: ${trackSid} of ${p.identity} reason=${reason}`,
      );
    // Mute events also fire for the local participant, which the Publisher
    // already logs.
    const onTrackMuted = (pub: TrackPublication, p: Participant): void => {
      if (!p.isLocal) log.info(`Muted: ${track(pub, p)}`);
    };
    const onTrackUnmuted = (pub: TrackPublication, p: Participant): void => {
      if (!p.isLocal) log.info(`Unmuted: ${track(pub, p)}`);
    };
    const onTrackStreamStateChanged = (
      pub: RemoteTrackPublication,
      state: Track.StreamState,
      p: RemoteParticipant,
    ): void => log.info(`Stream ${state}: ${track(pub, p)}`);
    const onEncryptionStatusChanged = (
      encrypted: boolean,
      p?: Participant,
    ): void =>
      log.info(
        `Encryption status of ${p?.identity ?? "unknown participant"}: encrypted=${encrypted}`,
      );
    // livekit-client throttles these per cryptor; they indicate frames being
    // dropped (missing/invalid key).
    const onEncryptionError = (error: Error, p?: Participant): void =>
      log.warn(
        `Encryption error for ${p?.identity ?? "unknown participant"}:`,
        error,
      );

    room
      .on(RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(RoomEvent.TrackPublished, onTrackPublished)
      .on(RoomEvent.TrackUnpublished, onTrackUnpublished)
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.TrackSubscriptionFailed, onTrackSubscriptionFailed)
      .on(RoomEvent.TrackMuted, onTrackMuted)
      .on(RoomEvent.TrackUnmuted, onTrackUnmuted)
      .on(RoomEvent.TrackStreamStateChanged, onTrackStreamStateChanged)
      .on(
        RoomEvent.ParticipantEncryptionStatusChanged,
        onEncryptionStatusChanged,
      )
      .on(RoomEvent.EncryptionError, onEncryptionError);
    this.scope.onEnd(() => {
      room
        .off(RoomEvent.ParticipantConnected, onParticipantConnected)
        .off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
        .off(RoomEvent.TrackPublished, onTrackPublished)
        .off(RoomEvent.TrackUnpublished, onTrackUnpublished)
        .off(RoomEvent.TrackSubscribed, onTrackSubscribed)
        .off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
        .off(RoomEvent.TrackSubscriptionFailed, onTrackSubscriptionFailed)
        .off(RoomEvent.TrackMuted, onTrackMuted)
        .off(RoomEvent.TrackUnmuted, onTrackUnmuted)
        .off(RoomEvent.TrackStreamStateChanged, onTrackStreamStateChanged)
        .off(
          RoomEvent.ParticipantEncryptionStatusChanged,
          onEncryptionStatusChanged,
        )
        .off(RoomEvent.EncryptionError, onEncryptionError);
    });
  }

  /**
   * Starts the connection.
   *
   * This will:
   * 1. Authenticate with the transport for our role, through the homeserver
   *    or the JWT service.
   * 2. Connect to the LiveKit room the token is for.
   *
   * The errors are also represented as a state in the `state$` observable.
   * It is safe to ignore those errors and handle them accordingly via the `state$` observable.
   * @throws {InsufficientCapacityError} if the LiveKit server indicates that it has insufficient capacity to accept the connection.
   * @throws {SFURoomCreationRestrictedError} if the LiveKit server indicates that the room does not exist and cannot be created.
   */
  // TODO consider an autostart pattern...
  public async start(): Promise<void> {
    this.logger.debug("Starting Connection");
    this.stopped = false;
    try {
      this._state$.next({ state: "authenticating" });
      const { url, jwt, livekitAlias } = await this.getSFUConfig();
      this.logger.debug(
        "Starting Connection - jwt: ",
        jwt,
        "wss: ",
        url,
        "livekitAlias: ",
        livekitAlias,
      );
      this._livekitAlias = livekitAlias;
      // If we were stopped while fetching the config, don't proceed to connect
      if (this.stopped) return;

      // Setup observer once we are done with getSFUConfig
      connectionStateObserver(this.livekitRoom)
        .pipe(this.scope.bind())
        .subscribe((livekitState) =>
          this._state$.next({ state: "authenticated", livekitState }),
        );

      try {
        this.logger.info(`livekitRoom.connect ${url}`);
        await this.connectLivekitRoom(url, jwt);
        this.logger.info(`livekitRoom.connect SUCCESS ${url}`);
      } catch (e) {
        this.logger.info(`livekitRoom.connect FAILED ${url}`, e);
        // LiveKit uses 503 to indicate that the server has hit its track limits.
        // https://github.com/livekit/livekit/blob/fcb05e97c5a31812ecf0ca6f7efa57c485cea9fb/pkg/service/rtcservice.go#L171
        // It also errors with a status code of 200 (yes, really) for room
        // participant limits.
        // LiveKit Cloud uses 429 for connection limits.
        // Either way, all these errors can be explained as "insufficient capacity".
        if (e instanceof ConnectionError) {
          if (e.status === 503 || e.status === 200 || e.status === 429) {
            throw new InsufficientCapacityError();
          }
          if (e.status === 404) {
            // error msg is "Failed to create call"
            // error description is "Call creation might be restricted to authorized users only. Try again later, or contact your server admin if the problem persists."
            // The room does not exist. There are two different modes of operation for the SFU:
            // - the room is created on the fly when connecting (livekit `auto_create` option)
            // - Only authorized users can create rooms, so the room must exist before connecting (done by the auth jwt service)
            // In the first case there will not be a 404, so we are in the second case.
            throw new SFURoomCreationRestrictedError();
          }

          if (e.reason === ConnectionErrorReason.Timeout) {
            // Unabled to establish peer connection within the timeout
            throw new PeerConnectionTimeoutError();
          }

          throw new LivekitConnectionError(e);
        }
        throw e;
      }
      // If we were stopped while connecting, don't proceed to update state.
      if (this.stopped) return;
    } catch (error) {
      if (this.stopped) {
        // stop() was called while we were connecting, which makes the pending
        // connect reject. That is the abort we asked for, not a failure, so
        // don't record an error state on a stopped connection or rethrow it
        // (start() is not necessarily awaited by the caller, so a throw here
        // becomes an unhandled promise rejection).
        this.logger.debug(`Connect aborted because the connection was stopped`);
        return;
      }
      this.logger.debug(`Failed to connect to LiveKit room: ${error}`);
      this._state$.next({
        state: "error",
        error:
          error instanceof MatrixRTCError
            ? error
            : error instanceof Error
              ? new UnknownRTCError(error)
              : new UnknownRTCError(new Error(`${error}`)),
      });
      // Its okay to ignore the throw. The error is part of the state.
      throw error;
    }
  }

  /**
   * Behind a proxy, Firefox fails the first WebSocket to a host after trying
   * it over HTTP/2, so a join that fails on the WebSocket gets a second try.
   * https://bugzilla.mozilla.org/show_bug.cgi?id=2015411
   */
  private async connectLivekitRoom(url: string, jwt: string): Promise<void> {
    try {
      await this.livekitRoom.connect(url, jwt);
    } catch (e) {
      const failedOnFirefoxWebSocket =
        getBrowser()?.name === "Firefox" &&
        e instanceof ConnectionError &&
        e.reason === ConnectionErrorReason.WebSocket;
      if (this.stopped || !failedOnFirefoxWebSocket) throw e;
      this.logger.info(`livekitRoom.connect RETRY ${url}`, e);
      await this.livekitRoom.connect(url, jwt);
    }
  }

  protected async getSFUConfig(): Promise<SFUConfig> {
    return await getSFUConfig({
      client: this.client,
      membership: this.ownMembershipIdentity,
      role: this.role,
      transport: this.transport,
      serverName: this.serverName,
      roomId: this.roomId,
      slotId: this.slotId,
      logger: this.logger,
    });
  }

  /**
   * Stops the connection.
   *
   * This will disconnect from the LiveKit room.
   * If the connection is already stopped, this is a no-op.
   */
  public async stop(): Promise<void> {
    this.logger.debug("stop: disconnecting from lk room");
    if (this.stopped) return;
    // Mark as stopped before disconnecting so that a connect() aborted by the
    // disconnect sees the flag and does not report the abort as an error.
    this.stopped = true;
    await this.livekitRoom.disconnect();
    this._state$.next({ state: "stopped" });
    this.logger.debug("stop: DONE disconnecting from lk room");
  }
}
