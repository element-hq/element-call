/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { connectedParticipantsObserver, connectionStateObserver } from "@livekit/components-core";
import { type ConnectionState, type E2EEOptions, Room as LivekitRoom } from "livekit-client";
import { type CallMembership, type LivekitFocus } from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest } from "rxjs";

import { getSFUConfigWithOpenID, type OpenIDClientParts, type SFUConfig } from "../livekit/openIDSFU";
import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { defaultLiveKitOptions } from "../livekit/options";

export interface ConnectionOpts {
  /** The focus server to connect to. */
  focus: LivekitFocus;
  /** The Matrix client to use for OpenID and SFU config requests. */
  client: OpenIDClientParts;
  /** The observable scope to use for this connection. */
  scope: ObservableScope;
  /** An observable of the current RTC call memberships and their associated focus. */
  membershipsFocusMap$: Behavior<{ membership: CallMembership; focus: LivekitFocus }[]>;
}
/**
 * A connection to a Matrix RTC LiveKit backend.
 *
 * Expose observables for participants and connection state.
 */
export class Connection {

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
    // TODO could this be loaded earlier to save time?
    const { url, jwt } = await this.getSFUConfigWithOpenID();

    if (!this.stopped) await this.livekitRoom.connect(url, jwt);
  }


  protected async getSFUConfigWithOpenID(): Promise<SFUConfig> {
    return await getSFUConfigWithOpenID(
      this.client,
      this.targetFocus.livekit_service_url,
      this.targetFocus.livekit_alias
    )
  }
  /**
   * Stops the connection.
   *
   * This will disconnect from the LiveKit room.
   * If the connection is already stopped, this is a no-op.
   */
  public stop(): void {
    if (this.stopped) return;
    void this.livekitRoom.disconnect();
    this.stopped = true;
  }


  /**
   * An observable of the participants that are publishing on this connection.
   * This is derived from `participantsIncludingSubscribers$` and `membershipsFocusMap$`.
   * It filters the participants to only those that are associated with a membership that claims to publish on this connection.
   */
  public readonly publishingParticipants$;

  /**
   * The focus server to connect to.
   */
  protected readonly targetFocus: LivekitFocus;

  /**
   * An observable of the livekit connection state.
   * Converts the livekit room events StateChange to an observable.
   */
  public connectionState$: Behavior<ConnectionState>;


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
    const { focus, client, scope, membershipsFocusMap$ } =
      opts;

    this.livekitRoom = livekitRoom
    this.targetFocus = focus;
    this.client = client;

    const participantsIncludingSubscribers$ = scope.behavior(
      connectedParticipantsObserver(this.livekitRoom),
      []
    );

    this.publishingParticipants$ = scope.behavior(
      combineLatest(
        [participantsIncludingSubscribers$, membershipsFocusMap$],
        (participants, membershipsFocusMap) =>
          membershipsFocusMap
            // Find all members that claim to publish on this connection
            .flatMap(({ membership, focus }) =>
              focus.livekit_service_url === this.targetFocus.livekit_service_url
                ? [membership]
                : []
            )
            // Find all associated publishing livekit participant objects
            .flatMap((membership) => {
              const participant = participants.find(
                (p) =>
                  p.identity === `${membership.sender}:${membership.deviceId}`
              );
              return participant ? [{ participant, membership }] : [];
            })
      ),
      []
    );
    this.connectionState$ = scope.behavior<ConnectionState>(
      connectionStateObserver(this.livekitRoom)
    );

    scope.onEnd(() => this.stop());
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
  public constructor(opts: ConnectionOpts, sharedE2eeOption: E2EEOptions | undefined) {
    const livekitRoom = new LivekitRoom({
      ...defaultLiveKitOptions,
      e2ee: sharedE2eeOption
    });
    super(livekitRoom, opts);
  }
}
