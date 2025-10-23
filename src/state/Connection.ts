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
  type ConnectionState,
  type E2EEOptions,
  type RemoteParticipant,
  Room as LivekitRoom,
  type RoomOptions,
} from "livekit-client";
import {
  type CallMembership,
  type LivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { logger } from "matrix-js-sdk/lib/logger";
import { BehaviorSubject, combineLatest, type Observable } from "rxjs";

import {
  getSFUConfigWithOpenID,
  type OpenIDClientParts,
  type SFUConfig,
} from "../livekit/openIDSFU";
import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { defaultLiveKitOptions } from "../livekit/options";
import {
  InsufficientCapacityError,
  SFURoomCreationRestrictedError,
} from "../utils/errors.ts";

export interface ConnectionOpts {
  /** The media transport to connect to. */
  transport: LivekitTransport;
  /** The Matrix client to use for OpenID and SFU config requests. */
  client: OpenIDClientParts;
  /** The observable scope to use for this connection. */
  scope: ObservableScope;
  /** An observable of the current RTC call memberships and their associated transports. */
  remoteTransports$: Behavior<
    { membership: CallMembership; transport: LivekitTransport }[]
  >;

  /** Optional factory to create the LiveKit room, mainly for testing purposes. */
  livekitRoomFactory?: (options?: RoomOptions) => LivekitRoom;
}

export type TransportState =
  | { state: "Initialized" }
  | { state: "FetchingConfig"; transport: LivekitTransport }
  | { state: "ConnectingToLkRoom"; transport: LivekitTransport }
  | { state: "PublishingTracks"; transport: LivekitTransport }
  | { state: "FailedToStart"; error: Error; transport: LivekitTransport }
  | {
      state: "ConnectedToLkRoom";
      connectionState$: Observable<ConnectionState>;
      transport: LivekitTransport;
    }
  | { state: "Stopped"; transport: LivekitTransport };

/**
 * Represents participant publishing or expected to publish on the connection.
 * It is paired with its associated rtc membership.
 */
export type PublishingParticipant = {
  /**
   * The LiveKit participant publishing on this connection, or undefined if the participant is not currently (yet) connected to the livekit room.
   */
  participant: RemoteParticipant | undefined;
  /**
   * The rtc call membership associated with this participant.
   */
  membership: CallMembership;
};

/**
 * A connection to a Matrix RTC LiveKit backend.
 *
 * Expose observables for participants and connection state.
 */
export class Connection {
  // Private Behavior
  private readonly _transportState$ = new BehaviorSubject<TransportState>({
    state: "Initialized",
  });

  /**
   * The current state of the connection to the media transport.
   */
  public readonly transportState$: Behavior<TransportState> =
    this._transportState$;

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
   * @throws {InsufficientCapacityError} if the LiveKit server indicates that it has insufficient capacity to accept the connection.
   * @throws {SFURoomCreationRestrictedError} if the LiveKit server indicates that the room does not exist and cannot be created.
   */
  public async start(): Promise<void> {
    this.stopped = false;
    try {
      this._transportState$.next({
        state: "FetchingConfig",
        transport: this.transport,
      });
      const { url, jwt } = await this.getSFUConfigWithOpenID();
      // If we were stopped while fetching the config, don't proceed to connect
      if (this.stopped) return;

      this._transportState$.next({
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

      this._transportState$.next({
        state: "ConnectedToLkRoom",
        transport: this.transport,
        connectionState$: connectionStateObserver(this.livekitRoom),
      });
    } catch (error) {
      this._transportState$.next({
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
    this._transportState$.next({
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
  public readonly publishingParticipants$: Behavior<PublishingParticipant[]>;

  /**
   * The media transport to connect to.
   */
  public readonly transport: LivekitTransport;

  private readonly client: OpenIDClientParts;
  /**
   * Creates a new connection to a matrix RTC LiveKit backend.
   *
   * @param livekitRoom - LiveKit room instance to use.
   * @param opts - Connection options {@link ConnectionOpts}.
   *
   */
  protected constructor(
    public readonly livekitRoom: LivekitRoom,
    opts: ConnectionOpts,
  ) {
    logger.log(
      `[Connection] Creating new connection to ${opts.transport.livekit_service_url} ${opts.transport.livekit_alias}`,
    );
    const { transport, client, scope, remoteTransports$ } = opts;

    this.transport = transport;
    this.client = client;

    const participantsIncludingSubscribers$ = scope.behavior(
      connectedParticipantsObserver(this.livekitRoom),
      [],
    );

    this.publishingParticipants$ = scope.behavior(
      combineLatest(
        [participantsIncludingSubscribers$, remoteTransports$],
        (participants, remoteTransports) =>
          remoteTransports
            // Find all members that claim to publish on this connection
            .flatMap(({ membership, transport }) =>
              transport.livekit_service_url ===
              this.transport.livekit_service_url
                ? [membership]
                : [],
            )
            // Pair with their associated LiveKit participant (if any)
            .map((membership) => {
              const id = `${membership.userId}:${membership.deviceId}`;
              const participant = participants.find((p) => p.identity === id);
              return { participant, membership };
            }),
      ),
      [],
    );

    scope.onEnd(() => void this.stop());
  }
}

/**
 * A remote connection to the Matrix RTC LiveKit backend.
 *
 * This connection is used for subscribing to remote participants.
 * It does not publish any local tracks.
 */
export class RemoteConnection extends Connection {
  /**
   * Creates a new remote connection to a matrix RTC LiveKit backend.
   * @param opts
   * @param sharedE2eeOption - The shared E2EE options to use for the connection.
   */
  public constructor(
    opts: ConnectionOpts,
    sharedE2eeOption: E2EEOptions | undefined,
  ) {
    const factory =
      opts.livekitRoomFactory ??
      ((options: RoomOptions): LivekitRoom => new LivekitRoom(options));
    const livekitRoom = factory({
      ...defaultLiveKitOptions,
      e2ee: sharedE2eeOption,
    });
    super(livekitRoom, opts);
  }
}
