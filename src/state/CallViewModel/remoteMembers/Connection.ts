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
  type Room as LivekitRoom,
  type RemoteParticipant,
} from "livekit-client";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, map } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";

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
  SFURoomCreationRestrictedError,
  UnknownCallError,
} from "../../../utils/errors.ts";

export interface ConnectionOpts {
  /** The media transport to connect to. */
  transport: LivekitTransport;
  /** The Matrix client to use for OpenID and SFU config requests. */
  client: OpenIDClientParts;
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
  public readonly transport: LivekitTransport;

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
   * Whether the connection has been stopped.
   * @see Connection.stop
   * */
  protected stopped = false;

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
      // It would probably be better to forward this here.
      const { url, jwt } = await this.getSFUConfigWithOpenID();
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
        await this.livekitRoom.connect(url, jwt);
      } catch (e) {
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

  protected async getSFUConfigWithOpenID(): Promise<SFUConfig> {
    return await getSFUConfigWithOpenID(
      this.client,
      this.transport.livekit_service_url,
      this.transport.livekit_alias,
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
      `Stopping connection to ${this.transport.livekit_service_url}`,
    );
    if (this.stopped) return;
    await this.livekitRoom.disconnect();
    this._state$.next(ConnectionState.Stopped);
    this.stopped = true;
  }

  private readonly client: OpenIDClientParts;
  private readonly logger: Logger;

  /**
   * Creates a new connection to a matrix RTC LiveKit backend.
   *
   * @param opts - Connection options {@link ConnectionOpts}.
   *
   * @param logger
   */
  public constructor(opts: ConnectionOpts, logger: Logger) {
    this.logger = logger.getChild("[Connection]");
    this.logger.info(
      `[Connection] Creating new connection to ${opts.transport.livekit_service_url} ${opts.transport.livekit_alias}`,
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
}
