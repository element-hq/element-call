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
  type RemoteParticipant,
  type Room as LivekitRoom,
} from "livekit-client";
import { type LivekitTransportConfig } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, map } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import {
  getSFUConfigWithOpenID,
  type OpenIDClientParts,
  type SFUConfig,
} from "../../../livekit/openIDSFU.ts";
import { type Behavior } from "../../Behavior.ts";
import { type ObservableScope } from "../../ObservableScope.ts";
import {
  ElementCallError,
  InsufficientCapacityError,
  LivekitConnectionError,
  PeerConnectionTimeoutError,
  SFURoomCreationRestrictedError,
  UnknownCallError,
} from "../../../utils/errors.ts";
import { type JwtEndpointVersion } from "../localMember/LocalTransport.ts";

export interface ConnectionOpts {
  /**
   * For the local transport we already do know the jwt token and url. We can reuse it.
   * On top the local transport will send additional data to the jwt server to use delayed event delegation.
   */
  existingSFUConfig?: SFUConfig;
  /**
   * For local connections that use the oldest member pattern. here we have not prefetched the sfuConfig
   * and hence we need to let the connection do the jwt token fetching.
   */
  forceJwtEndpoint?: JwtEndpointVersion;
  /** The identity parts to use on this connection */
  ownMembershipIdentity: CallMembershipIdentityParts;
  /** The media transport to connect to. */
  transport: LivekitTransportConfig;
  /** The Matrix client to use for OpenID and SFU config requests. */
  client: OpenIDClientParts;
  /** The room ID this connection is associated with. */
  roomId: string;
  /** The observable scope to use for this connection. */
  scope: ObservableScope;

  /** Optional factory to create the LiveKit room, mainly for testing purposes. */
  livekitRoomFactory: () => LivekitRoom;
}
export class FailedToStartError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FailedToStartError";
  }
}

export enum ConnectionState {
  /** The start state of a connection. It has been created but nothing has loaded yet. */
  Initialized = "Initialized",
  /** `start` has been called on the connection. It aquires the jwt info to conenct to the LK Room  */
  FetchingConfig = "FetchingConfig",
  Stopped = "Stopped",
  /** The same as ConnectionState.Disconnected from `livekit-client` */
  LivekitDisconnected = "disconnected",
  /** The same as ConnectionState.Connecting from `livekit-client` */
  LivekitConnecting = "connecting",
  /** The same as ConnectionState.Connected from `livekit-client` */
  LivekitConnected = "connected",
  /** The same as ConnectionState.Reconnecting from `livekit-client` */
  LivekitReconnecting = "reconnecting",
  /** The same as ConnectionState.SignalReconnecting from `livekit-client` */
  LivekitSignalReconnecting = "signalReconnecting",
}

/**
 * A connection to a Matrix RTC LiveKit backend.
 *
 * Expose observables for participants and connection state.
 */
export class Connection {
  // Private Behavior
  private readonly _state$ = new BehaviorSubject<
    ConnectionState | ElementCallError
  >(ConnectionState.Initialized);

  /**
   * The current state of the connection to the media transport.
   */
  public readonly state$: Behavior<ConnectionState | Error> = this._state$;

  /**
   * The media transport to connect to.
   */
  public readonly transport: LivekitTransportConfig;

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

  // TODO: can we just keep the ConnectionOpts object instead of spreading?
  private readonly client: OpenIDClientParts;
  private readonly roomId: string;
  private readonly logger: Logger;
  private readonly ownMembershipIdentity: CallMembershipIdentityParts;
  private readonly existingSFUConfig?: SFUConfig;
  /**
   * Creates a new connection to a matrix RTC LiveKit backend.
   *
   * @param opts - Connection options {@link ConnectionOpts}.
   *
   * @param logger - The logger to use.
   */
  public constructor(opts: ConnectionOpts, logger: Logger) {
    this.ownMembershipIdentity = opts.ownMembershipIdentity;
    this.existingSFUConfig = opts.existingSFUConfig;
    this.roomId = opts.roomId;
    this.logger = logger.getChild(
      "[Connection " + opts.transport.livekit_service_url + "]",
    );
    this.logger.info(
      `constructor: ${opts.transport.livekit_service_url} roomId: ${this.roomId} withSfuConfig?: ${opts.existingSFUConfig ? JSON.stringify(opts.existingSFUConfig) : "undefined"}`,
    );
    const { transport, client, scope } = opts;

    this.scope = scope;
    this.livekitRoom = opts.livekitRoomFactory();
    this.transport = transport;
    this.client = client;

    this.remoteParticipants$ = scope.behavior(
      // Only tracks remote participants
      connectedParticipantsObserver(this.livekitRoom),
    );

    scope.onEnd(() => {
      this.logger.info(`Connection scope ended, stopping connection`);
      void this.stop();
    });
  }

  /**
   * Starts the connection.
   *
   * This will:
   * 1. Request an OpenId token `request_token` (allows matrix users to verify their identity with a third-party service.)
   * 2. Use this token to request the SFU config to the MatrixRtc authentication service.
   * 3. Connect to the configured LiveKit room.
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
      this._state$.next(ConnectionState.FetchingConfig);
      // We should already have this information after creating the localTransport.
      // only call getSFUConfigWithOpenID for connections where we do not have a token yet. (existingJwtTokenData === undefined)
      const { url, jwt, livekitAlias } =
        this.existingSFUConfig ??
        (await this.getSFUConfigForRemoteConnection());
      this.logger.debug(
        "Starting Connection to: ",
        this.transport.livekit_service_url,
        "jwt: ",
        jwt,
        "wss: ",
        url,
        "livekitAlias: ",
        livekitAlias,
      );
      this._livekitAlias = livekitAlias;
      // If we were stopped while fetching the config, don't proceed to connect
      if (this.stopped) return;

      // Setup observer once we are done with getSFUConfigWithOpenID
      connectionStateObserver(this.livekitRoom)
        .pipe(
          this.scope.bind(),
          map((s) => s as unknown as ConnectionState),
        )
        .subscribe((lkState) => {
          // It is save to cast lkState to ConnectionState as they are fully overlapping.
          this._state$.next(lkState);
        });

      try {
        this.logger.info(`livekitRoom.connect ${url}`);
        await this.livekitRoom.connect(url, jwt);
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
      this.logger.debug(`Failed to connect to LiveKit room: ${error}`);
      this._state$.next(
        error instanceof ElementCallError
          ? error
          : error instanceof Error
            ? new UnknownCallError(error)
            : new UnknownCallError(new Error(`${error}`)),
      );
      // Its okay to ignore the throw. The error is part of the state.
      throw error;
    }
  }

  protected async getSFUConfigForRemoteConnection(): Promise<SFUConfig> {
    // This will only be called for sfu's where we do not publish ourselves.
    // For the local connection we will use the existingJwtTokenData
    return await getSFUConfigWithOpenID(
      this.client,
      this.ownMembershipIdentity,
      this.transport.livekit_service_url,
      this.roomId,
      // dont pass any custom opts for the subscribe only connections
      {},
      this.logger,
    );
  }

  /**
   * Stops the connection.
   *
   * This will disconnect from the LiveKit room.
   * If the connection is already stopped, this is a no-op.
   */
  public async stop(): Promise<void> {
    this.logger.debug(
      `stop: disconnecing from lk room ${this.transport.livekit_service_url}`,
    );
    if (this.stopped) return;
    await this.livekitRoom.disconnect();
    this._state$.next(ConnectionState.Stopped);
    this.stopped = true;
    this.logger.debug(
      `stop: DONE disconnecing from lk room ${this.transport.livekit_service_url}`,
    );
  }
}
