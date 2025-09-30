/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { connectedParticipantsObserver, connectionStateObserver } from "@livekit/components-core";
import { type ConnectionState, type E2EEOptions, Room as LivekitRoom } from "livekit-client";
import { type MatrixClient } from "matrix-js-sdk";
import { type CallMembership, type LivekitFocus } from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest } from "rxjs";

import { getSFUConfigWithOpenID } from "../livekit/openIDSFU";
import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { defaultLiveKitOptions } from "../livekit/options";

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
    const { url, jwt } = await this.sfuConfig;
    if (!this.stopped) await this.livekitRoom.connect(url, jwt);
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

  protected readonly sfuConfig = getSFUConfigWithOpenID(
    this.client,
    this.focus.livekit_service_url,
    this.focus.livekit_alias
  );

  /*
    * An observable of the participants in the livekit room, including subscribers.
    * Converts the livekit room events ParticipantConnected/ParticipantDisconnected/StateChange to an observable.
   */
  protected readonly participantsIncludingSubscribers$;

  /**
   * An observable of the participants that are publishing on this connection.
   * This is derived from `participantsIncludingSubscribers$` and `membershipsFocusMap$`.
   * It filters the participants to only those that are associated with a membership that claims to publish on this connection.
   */
  public readonly publishingParticipants$;

  /**
   * The LiveKit room instance.
   */
  public readonly livekitRoom: LivekitRoom;

  /**
   * An observable of the livekit connection state.
   * Converts the livekit room events StateChange to an observable.
   */
  public connectionState$: Behavior<ConnectionState>;

  /**
   * Creates a new connection to a matrix RTC LiveKit backend.
   *
   * @param livekitRoom - Optional LiveKit room instance to use. If not provided, a new instance will be created.
   * @param focus - The focus server to connect to.
   * @param livekitAlias - The livekit alias to use when connecting to the focus server. TODO duplicate of focus?
   * @param client - The matrix client, used to fetch the OpenId token. TODO refactor to avoid passing the whole client
   * @param scope - The observable scope to use for creating observables.
   * @param membershipsFocusMap$ - The observable of the current call RTC memberships and their associated focus.
   * @param e2eeLivekitOptions - The E2EE options to use for the LiveKit room. Use to share the same key provider across connections!. TODO refactor to avoid passing the whole options?
   */
  public constructor(
    protected readonly focus: LivekitFocus,
    // TODO : remove livekitAlias, it's already in focus?
    protected readonly livekitAlias: string,
    protected readonly client: MatrixClient,
    protected readonly scope: ObservableScope,
    protected readonly membershipsFocusMap$: Behavior<
      { membership: CallMembership; focus: LivekitFocus }[]
    >,
    e2eeLivekitOptions: E2EEOptions | undefined,
    livekitRoom: LivekitRoom | undefined = undefined
  ) {
    this.livekitRoom =
      livekitRoom ??
      new LivekitRoom({
        ...defaultLiveKitOptions,
        e2ee: e2eeLivekitOptions
      });
    this.participantsIncludingSubscribers$ = this.scope.behavior(
      connectedParticipantsObserver(this.livekitRoom),
      []
    );

    this.publishingParticipants$ = this.scope.behavior(
      combineLatest(
        [this.participantsIncludingSubscribers$, this.membershipsFocusMap$],
        (participants, membershipsFocusMap) =>
          membershipsFocusMap
            // Find all members that claim to publish on this connection
            .flatMap(({ membership, focus }) =>
              focus.livekit_service_url === this.focus.livekit_service_url
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
    this.connectionState$ = this.scope.behavior<ConnectionState>(
      connectionStateObserver(this.livekitRoom)
    );

    this.scope.onEnd(() => this.stop());
  }
}

