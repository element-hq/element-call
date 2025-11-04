/*
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
  type ConnectionState as LivekitConenctionState,
  type Room as LivekitRoom,
  type Participant,
  RoomEvent,
} from "livekit-client";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, type Observable } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";

import {
  getSFUConfigWithOpenID,
  type OpenIDClientParts,
  type SFUConfig,
} from "../../livekit/openIDSFU.ts";
import { type Behavior } from "../Behavior.ts";
import { type ObservableScope } from "../ObservableScope.ts";
import {
  InsufficientCapacityError,
  SFURoomCreationRestrictedError,
} from "../../utils/errors.ts";

export type PublishingParticipant = Participant;

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

export type ConnectionState =
  | { state: "Initialized" }
  | { state: "FetchingConfig"; transport: LivekitTransport }
  | { state: "ConnectingToLkRoom"; transport: LivekitTransport }
  | { state: "PublishingTracks"; transport: LivekitTransport }
  | { state: "FailedToStart"; error: Error; transport: LivekitTransport }
  | {
      state: "ConnectedToLkRoom";
      livekitConnectionState$: Observable<LivekitConenctionState>;
      transport: LivekitTransport;
    }
  | { state: "Stopped"; transport: LivekitTransport };

/**
 * A connection to a Matrix RTC LiveKit backend.
 *
 * Expose observables for participants and connection state.
 */
export class Connection {
  // Private Behavior
  private readonly _state$ = new BehaviorSubject<ConnectionState>({
    state: "Initialized",
  });

  /**
   * The current state of the connection to the media transport.
   */
  public readonly state$: Behavior<ConnectionState> = this._state$;

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
  // TODO dont make this throw and instead store a connection error state in this class?
  // TODO consider an autostart pattern...
  public async start(): Promise<void> {
    this.stopped = false;
    try {
      this._state$.next({
        state: "FetchingConfig",
        transport: this.transport,
      });
      const { url, jwt } = await this.getSFUConfigWithOpenID();
      // If we were stopped while fetching the config, don't proceed to connect
      if (this.stopped) return;

      this._state$.next({
        state: "ConnectingToLkRoom",
        transport: this.transport,
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
            // error msg is "Could not establish signal connection: requested room does not exist"
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

      this._state$.next({
        state: "ConnectedToLkRoom",
        transport: this.transport,
        livekitConnectionState$: connectionStateObserver(this.livekitRoom),
      });
    } catch (error) {
      this._state$.next({
        state: "FailedToStart",
        error: error instanceof Error ? error : new Error(`${error}`),
        transport: this.transport,
      });
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
    if (this.stopped) return;
    await this.livekitRoom.disconnect();
    this._state$.next({
      state: "Stopped",
      transport: this.transport,
    });
    this.stopped = true;
  }

  /**
   * An observable of the participants that are publishing on this connection.
   * This is derived from `participantsIncludingSubscribers$` and `remoteTransports$`.
   * It filters the participants to only those that are associated with a membership that claims to publish on this connection.
   */

  public readonly participantsWithTrack$: Behavior<PublishingParticipant[]>;

  /**
   * The media transport to connect to.
   */
  public readonly transport: LivekitTransport;

  private readonly client: OpenIDClientParts;
  public readonly livekitRoom: LivekitRoom;

  /**
   * Creates a new connection to a matrix RTC LiveKit backend.
   *
   * @param livekitRoom - LiveKit room instance to use.
   * @param opts - Connection options {@link ConnectionOpts}.
   *
   */
  public constructor(opts: ConnectionOpts, logger?: Logger) {
    logger?.info(
      `[Connection] Creating new connection to ${opts.transport.livekit_service_url} ${opts.transport.livekit_alias}`,
    );
    const { transport, client, scope } = opts;

    this.livekitRoom = opts.livekitRoomFactory();
    this.transport = transport;
    this.client = client;

    this.participantsWithTrack$ = scope.behavior(
      connectedParticipantsObserver(this.livekitRoom, {
        additionalRoomEvents: [
          RoomEvent.TrackPublished,
          RoomEvent.TrackUnpublished,
        ],
      }),
      [],
    );

    scope.onEnd(() => void this.stop());
  }
}
