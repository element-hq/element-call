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
  type ConnectionState,
  type E2EEOptions,
  Room as LivekitRoom,
  type RoomOptions,
} from "livekit-client";
import {
  type CallMembership,
  type LivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, combineLatest } from "rxjs";

import {
  getSFUConfigWithOpenID,
  type OpenIDClientParts,
  type SFUConfig,
} from "../livekit/openIDSFU";
import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { defaultLiveKitOptions } from "../livekit/options";

export interface ConnectionOpts {
  /** The focus server to connect to. */
  transport: LivekitTransport;
  /** The Matrix client to use for OpenID and SFU config requests. */
  client: OpenIDClientParts;
  /** The observable scope to use for this connection. */
  scope: ObservableScope;
  /** An observable of the current RTC call memberships and their associated focus. */
  remoteTransports$: Behavior<
    { membership: CallMembership; transport: LivekitTransport }[]
  >;

  /** Optional factory to create the Livekit room, mainly for testing purposes. */
  livekitRoomFactory?: (options?: RoomOptions) => LivekitRoom;
}

export type FocusConnectionState =
  | { state: "Initialized" }
  | { state: "FetchingConfig"; focus: LivekitTransport }
  | { state: "ConnectingToLkRoom"; focus: LivekitTransport }
  | { state: "PublishingTracks"; focus: LivekitTransport }
  | { state: "FailedToStart"; error: Error; focus: LivekitTransport }
  | {
      state: "ConnectedToLkRoom";
      connectionState: ConnectionState;
      focus: LivekitTransport;
    }
  | { state: "Stopped"; focus: LivekitTransport };

/**
 * A connection to a Matrix RTC LiveKit backend.
 *
 * Expose observables for participants and connection state.
 */
export class Connection {
  // Private Behavior
  private readonly _focusConnectionState$ =
    new BehaviorSubject<FocusConnectionState>({ state: "Initialized" });

  /**
   * The current state of the connection to the focus server.
   */
  public readonly focusConnectionState$: Behavior<FocusConnectionState> =
    this._focusConnectionState$;

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
   */
  public async start(): Promise<void> {
    this.stopped = false;
    try {
      this._focusConnectionState$.next({
        state: "FetchingConfig",
        focus: this.localTransport,
      });
      // TODO could this be loaded earlier to save time?
      const { url, jwt } = await this.getSFUConfigWithOpenID();
      // If we were stopped while fetching the config, don't proceed to connect
      if (this.stopped) return;

      this._focusConnectionState$.next({
        state: "ConnectingToLkRoom",
        focus: this.localTransport,
      });
      await this.livekitRoom.connect(url, jwt);
      // If we were stopped while connecting, don't proceed to update state.
      if (this.stopped) return;

      this._focusConnectionState$.next({
        state: "ConnectedToLkRoom",
        focus: this.localTransport,
        connectionState: this.livekitRoom.state,
      });
    } catch (error) {
      this._focusConnectionState$.next({
        state: "FailedToStart",
        error: error instanceof Error ? error : new Error(`${error}`),
        focus: this.localTransport,
      });
      throw error;
    }
  }

  protected async getSFUConfigWithOpenID(): Promise<SFUConfig> {
    return await getSFUConfigWithOpenID(
      this.client,
      this.localTransport.livekit_service_url,
      this.localTransport.livekit_alias,
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
    this._focusConnectionState$.next({
      state: "Stopped",
      focus: this.localTransport,
    });
    this.stopped = true;
  }

  /**
   * An observable of the participants that are publishing on this connection.
   * This is derived from `participantsIncludingSubscribers$` and `remoteTransports$`.
   * It filters the participants to only those that are associated with a membership that claims to publish on this connection.
   */
  public readonly publishingParticipants$;

  /**
   * The focus server to connect to.
   */
  public readonly localTransport: LivekitTransport;

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
    const { transport, client, scope, remoteTransports$ } = opts;

    this.localTransport = transport;
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
              this.localTransport.livekit_service_url
                ? [membership]
                : [],
            )
            // Pair with their associated LiveKit participant (if any)
            // Uses flatMap to filter out memberships with no associated rtc participant ([])
            .flatMap((membership) => {
              const id = `${membership.sender}:${membership.deviceId}`;
              const participant = participants.find((p) => p.identity === id);
              return participant ? [{ participant, membership }] : [];
            }),
      ),
      [],
    );

    scope
      .behavior<ConnectionState>(connectionStateObserver(this.livekitRoom))
      .subscribe((connectionState) => {
        const current = this._focusConnectionState$.value;
        // Only update the state if we are already connected to the LiveKit room.
        if (current.state === "ConnectedToLkRoom") {
          this._focusConnectionState$.next({
            state: "ConnectedToLkRoom",
            connectionState,
            focus: current.focus,
          });
        }
      });

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
