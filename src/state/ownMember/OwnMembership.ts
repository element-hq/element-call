/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { LiveKitReactNativeInfo } from "livekit-client";
import { Behavior, constant } from "../Behavior";
import { LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { ConnectionManager } from "../remoteMembers/ConnectionManager";

const ownMembership$ = (
  multiSfu: boolean,
  preferStickyEvents: boolean,
  connectionManager: ConnectionManager,
  transport: LivekitTransport,
): {
  connected: Behavior<boolean>;
  transport: Behavior<LivekitTransport | null>;
} => {
  const userId = this.matrixRoom.client.getUserId()!;
  const deviceId = this.matrixRoom.client.getDeviceId()!;

  const connection = connectionManager.registerTransports(
    constant([transport]),
  );
  const publisher = new Publisher(connection);

  // HOW IT WAS PREVIEOUSLY CREATED
  // new PublishConnection(
  //   {
  //     transport,
  //     client: this.matrixRoom.client,
  //     scope,
  //     remoteTransports$: this.remoteTransports$,
  //     livekitRoomFactory: this.options.livekitRoomFactory,
  //   },
  //   this.mediaDevices,
  //   this.muteStates,
  //   this.e2eeLivekitOptions(),
  //   this.scope.behavior(this.trackProcessorState$),
  // ),
  /**
   * The transport that we would personally prefer to publish on (if not for the
   * transport preferences of others, perhaps).
   */
  // DISCUSS move to ownMembership
  private readonly preferredTransport$ = this.scope.behavior(
    async$(makeTransport(this.matrixRTCSession)),
  );

  /**
   * The transport over which we should be actively publishing our media.
   * null when not joined.
   */
  // DISCUSSION ownMembershipManager
  private readonly localTransport$: Behavior<Async<LivekitTransport> | null> =
    this.scope.behavior(
      this.transports$.pipe(
        map((transports) => transports?.local ?? null),
        distinctUntilChanged<Async<LivekitTransport> | null>(deepCompare),
      ),
    );

  /**
   * The transport we should advertise in our MatrixRTC membership (plus whether
   * it is a multi-SFU transport and whether we should use sticky events).
   */
  // DISCUSSION ownMembershipManager
  private readonly advertisedTransport$: Behavior<{
    multiSfu: boolean;
    preferStickyEvents: boolean;
    transport: LivekitTransport;
  } | null> = this.scope.behavior(
    this.transports$.pipe(
      map((transports) =>
        transports?.local.state === "ready" &&
        transports.preferred.state === "ready"
          ? {
              multiSfu: transports.multiSfu,
              preferStickyEvents: transports.preferStickyEvents,
              // In non-multi-SFU mode we should always advertise the preferred
              // SFU to minimize the number of membership updates
              transport: transports.multiSfu
                ? transports.local.value
                : transports.preferred.value,
            }
          : null,
      ),
      distinctUntilChanged<{
        multiSfu: boolean;
        preferStickyEvents: boolean;
        transport: LivekitTransport;
      } | null>(deepCompare),
    ),
  );

  // MATRIX RELATED
  //
  /**
   * Whether we are "fully" connected to the call. Accounts for both the
   * connection to the MatrixRTC session and the LiveKit publish connection.
   */
  // DISCUSSION own membership manager
  private readonly connected$ = this.scope.behavior(
    and$(
      this.matrixConnected$,
      this.livekitConnectionState$.pipe(
        map((state) => state === ConnectionState.Connected),
      ),
    ),
  );

  /**
   * Whether we should tell the user that we're reconnecting to the call.
   */
  // DISCUSSION own membership manager
  public readonly reconnecting$ = this.scope.behavior(
    this.connected$.pipe(
      // We are reconnecting if we previously had some successful initial
      // connection but are now disconnected
      scan(
        ({ connectedPreviously }, connectedNow) => ({
          connectedPreviously: connectedPreviously || connectedNow,
          reconnecting: connectedPreviously && !connectedNow,
        }),
        { connectedPreviously: false, reconnecting: false },
      ),
      map(({ reconnecting }) => reconnecting),
    ),
  );
  return { connected: true, transport$ };
};
