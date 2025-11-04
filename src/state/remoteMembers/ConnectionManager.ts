// TODOs:
// - make ConnectionManager its own actual class

/*
Copyright 2025 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type LivekitTransport,
  type ParticipantId,
} from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, combineLatest, map, switchMap } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type Participant as LivekitParticipant } from "livekit-client";

import { type Behavior } from "../Behavior";
import { type Connection } from "./Connection";
import { type ObservableScope } from "../ObservableScope";
import { generateKeyed$ } from "../../utils/observable";
import { areLivekitTransportsEqual } from "./matrixLivekitMerger";
import { type ConnectionFactory } from "./ConnectionFactory.ts";

export class ConnectionManagerData {
  private readonly store: Map<string, [Connection, LivekitParticipant[]]> =
    new Map();

  public constructor() {}

  public add(connection: Connection, participants: LivekitParticipant[]): void {
    const key = this.getKey(connection.transport);
    const existing = this.store.get(key);
    if (!existing) {
      this.store.set(key, [connection, participants]);
    } else {
      existing[1].push(...participants);
    }
  }

  private getKey(transport: LivekitTransport): string {
    return transport.livekit_service_url + "|" + transport.livekit_alias;
  }

  public getConnections(): Connection[] {
    return Array.from(this.store.values()).map(([connection]) => connection);
  }

  public getConnectionForTransport(
    transport: LivekitTransport,
  ): Connection | undefined {
    return this.store.get(this.getKey(transport))?.[0];
  }

  public getParticipantForTransport(
    transport: LivekitTransport,
  ): LivekitParticipant[] {
    const key = transport.livekit_service_url + "|" + transport.livekit_alias;
    const existing = this.store.get(key);
    if (existing) {
      return existing[1];
    }
    return [];
  }
  /**
   * Get all connections where the given participant is publishing.
   * In theory, there could be several connections where the same participant is publishing but with
   * only well behaving clients a participant should only be publishing on a single connection.
   * @param participantId
   */
  public getConnectionsForParticipant(
    participantId: ParticipantId,
  ): Connection[] {
    const connections: Connection[] = [];
    for (const [connection, participants] of this.store.values()) {
      if (participants.some((p) => p.identity === participantId)) {
        connections.push(connection);
      }
    }
    return connections;
  }
}

// TODO - write test for scopes (do we really need to bind scope)
export class ConnectionManager {
  private readonly logger: Logger;

  public constructor(
    private readonly scope: ObservableScope,
    private readonly connectionFactory: ConnectionFactory,
    logger: Logger,
  ) {
    this.logger = logger.getChild("ConnectionManager");
  }

  /**
   * A list of Behaviors each containing a LIST of LivekitTransport.
   * Each of these behaviors can be interpreted as subscribed list of transports.
   *
   * Using `registerTransports` independent external modules can control what connections
   * are created by the ConnectionManager.
   *
   * The connection manager will remove all duplicate transports in each subscibed list.
   *
   * See `unregisterAllTransports` and `unregisterTransport` for details on how to unsubscribe.
   */
  private readonly transportsSubscriptions$ = new BehaviorSubject<
    Behavior<LivekitTransport[]>[]
  >([]);

  /**
   * All transports currently managed by the ConnectionManager.
   *
   * This list does not include duplicate transports.
   *
   * It is build based on the list of subscribed transports (`transportsSubscriptions$`).
   * externally this is modified via `registerTransports()`.
   */
  private readonly transports$ = this.scope.behavior(
    this.transportsSubscriptions$.pipe(
      switchMap((subscriptions) =>
        combineLatest(subscriptions).pipe(
          map((transportsNested) => transportsNested.flat()),
          map(removeDuplicateTransports),
        ),
      ),
    ),
    [],
  );

  /**
   * Connections for each transport in use by one or more session members.
   */
  public readonly connections$ = this.scope.behavior(
    generateKeyed$<LivekitTransport[], Connection, Connection[]>(
      this.transports$,
      (transports, createOrGet) => {
        const createConnection =
          (
            transport: LivekitTransport,
          ): ((scope: ObservableScope) => Connection) =>
          (scope) => {
            const connection = this.connectionFactory.createConnection(
              transport,
              scope,
              this.logger,
            );
            // Start the connection immediately
            // Use connection state to track connection progress
            void connection.start();
            // TODO subscribe to connection state to retry or log issues?
            return connection;
          };

        return transports.map((transport) => {
          const key =
            transport.livekit_service_url + "|" + transport.livekit_alias;
          return createOrGet(key, createConnection(transport));
        });
      },
    ),
  );

  /**
   * Add an a Behavior containing a list of transports to this ConnectionManager.
   *
   * The intended usage is:
   *  - create a ConnectionManager
   *  - register one `transports$` behavior using registerTransports
   *  - add new connections to the `ConnectionManager` by updating the `transports$` behavior
   *  - remove a single connection by removing the transport.
   *  - remove this subscription by calling `unregisterTransports` and passing
   *    the same `transports$` behavior reference.
   * @param transports$ The Behavior containing a list of transports to subscribe to.
   */
  public registerTransports(transports$: Behavior<LivekitTransport[]>): void {
    if (!this.transportsSubscriptions$.value.some((t$) => t$ === transports$)) {
      this.transportsSubscriptions$.next(
        this.transportsSubscriptions$.value.concat(transports$),
      );
    }
    // // After updating the subscriptions our connection list is also updated.
    // return transports$.value
    //   .map((transport) => {
    //     const isConnectionForTransport = (connection: Connection): boolean =>
    //       areLivekitTransportsEqual(connection.transport, transport);
    //     return this.connections$.value.find(isConnectionForTransport);
    //   })
    //   .filter((c) => c !== undefined);
  }

  /**
   * Unsubscribe from the given transports.
   * @param transports$ The behavior to unsubscribe from
   * @returns
   */
  public unregisterTransports(
    transports$: Behavior<LivekitTransport[]>,
  ): boolean {
    const subscriptions = this.transportsSubscriptions$.value;
    const subscriptionsUnregistered = subscriptions.filter(
      (t$) => t$ !== transports$,
    );
    const canUnregister =
      subscriptions.length !== subscriptionsUnregistered.length;
    if (canUnregister)
      this.transportsSubscriptions$.next(subscriptionsUnregistered);
    return canUnregister;
  }

  /**
   * Unsubscribe from all transports.
   */
  public unregisterAllTransports(): void {
    this.transportsSubscriptions$.next([]);
  }

  public connectionManagerData$: Behavior<ConnectionManagerData> =
    this.scope.behavior(
      this.connections$.pipe(
        switchMap((connections) => {
          // Map the connections to list of {connection, participants}[]
          const listOfConnectionsWithPublishingParticipants = connections.map(
            (connection) => {
              return connection.participantsWithTrack$.pipe(
                map((participants) => ({
                  connection,
                  participants,
                })),
              );
            },
          );
          // combineLatest the several streams into a single stream with the ConnectionManagerData
          return combineLatest(
            listOfConnectionsWithPublishingParticipants,
          ).pipe(
            map((lists) =>
              lists.reduce((data, { connection, participants }) => {
                data.add(connection, participants);
                return data;
              }, new ConnectionManagerData()),
            ),
          );
        }),
      ),
      // start empty
      new ConnectionManagerData(),
    );
}

function removeDuplicateTransports(
  transports: LivekitTransport[],
): LivekitTransport[] {
  return transports.reduce((acc, transport) => {
    if (!acc.some((t) => areLivekitTransportsEqual(t, transport)))
      acc.push(transport);
    return acc;
  }, [] as LivekitTransport[]);
}
