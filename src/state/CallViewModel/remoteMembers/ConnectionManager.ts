/*
Copyright 2025 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest, map, of, switchMap, tap } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type RemoteParticipant } from "livekit-client";

import { type Behavior } from "../../Behavior.ts";
import { type Connection } from "./Connection.ts";
import { Epoch, type ObservableScope } from "../../ObservableScope.ts";
import { generateItemsWithEpoch } from "../../../utils/observable.ts";
import { areLivekitTransportsEqual } from "./MatrixLivekitMembers.ts";
import { type ConnectionFactory } from "./ConnectionFactory.ts";

export class ConnectionManagerData {
  private readonly store: Map<string, [Connection, RemoteParticipant[]]> =
    new Map();

  public constructor() {}

  public add(connection: Connection, participants: RemoteParticipant[]): void {
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
  ): Connection | null {
    return this.store.get(this.getKey(transport))?.[0] ?? null;
  }

  public getParticipantForTransport(
    transport: LivekitTransport,
  ): RemoteParticipant[] {
    const key = transport.livekit_service_url + "|" + transport.livekit_alias;
    return this.store.get(key)?.[1] ?? [];
  }
}

interface Props {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  inputTransports$: Behavior<Epoch<LivekitTransport[]>>;
  logger: Logger;
}

// TODO - write test for scopes (do we really need to bind scope)
export interface IConnectionManager {
  connectionManagerData$: Behavior<Epoch<ConnectionManagerData>>;
}

/**
 * Crete a `ConnectionManager`
 * @param scope the observable scope used by this object.
 * @param connectionFactory used to create new connections.
 * @param _transportsSubscriptions$ A list of Behaviors each containing a LIST of LivekitTransport.
 *   Each of these behaviors can be interpreted as subscribed list of transports.
 *
 *   Using `registerTransports` independent external modules can control what connections
 *   are created by the ConnectionManager.
 *
 *   The connection manager will remove all duplicate transports in each subscibed list.
 *
 *   See `unregisterAllTransports` and `unregisterTransport` for details on how to unsubscribe.
 */
export function createConnectionManager$({
  scope,
  connectionFactory,
  inputTransports$,
  logger: parentLogger,
}: Props): IConnectionManager {
  const logger = parentLogger.getChild("[ConnectionManager]");
  // TODO logger: only construct one logger from the client and make it compatible via a EC specific sing

  /**
   * All transports currently managed by the ConnectionManager.
   *
   * This list does not include duplicate transports.
   *
   * It is build based on the list of subscribed transports (`transportsSubscriptions$`).
   * externally this is modified via `registerTransports()`.
   */
  const transports$ = scope.behavior(
    inputTransports$.pipe(
      map((transports) => transports.mapInner(removeDuplicateTransports)),
      tap(({ value: transports }) => {
        logger.trace(
          `Managing transports: ${transports.map((t) => t.livekit_service_url).join(", ")}`,
        );
      }),
    ),
  );

  /**
   * Connections for each transport in use by one or more session members.
   */
  const connections$ = scope.behavior(
    transports$.pipe(
      generateItemsWithEpoch(
        function* (transports) {
          for (const transport of transports)
            yield {
              keys: [transport.livekit_service_url, transport.livekit_alias],
              data: undefined,
            };
        },
        (scope, _data$, serviceUrl, alias) => {
          logger.debug(`Creating connection to ${serviceUrl} (${alias})`);
          const connection = connectionFactory.createConnection(
            {
              type: "livekit",
              livekit_service_url: serviceUrl,
              livekit_alias: alias,
            },
            scope,
            logger,
          );
          // Start the connection immediately
          // Use connection state to track connection progress
          void connection.start();
          // TODO subscribe to connection state to retry or log issues?
          return connection;
        },
      ),
    ),
  );

  const connectionManagerData$ = scope.behavior(
    connections$.pipe(
      switchMap((connections) => {
        const epoch = connections.epoch;

        // Map the connections to list of {connection, participants}[]
        const listOfConnectionsWithRemoteParticipants = connections.value.map(
          (connection) => {
            return connection.remoteParticipants$.pipe(
              map((participants) => ({
                connection,
                participants,
              })),
            );
          },
        );

        // probably not required
        if (listOfConnectionsWithRemoteParticipants.length === 0) {
          return of(new Epoch(new ConnectionManagerData(), epoch));
        }

        // combineLatest the several streams into a single stream with the ConnectionManagerData
        return combineLatest(listOfConnectionsWithRemoteParticipants).pipe(
          map(
            (lists) =>
              new Epoch(
                lists.reduce((data, { connection, participants }) => {
                  data.add(connection, participants);
                  return data;
                }, new ConnectionManagerData()),
                epoch,
              ),
          ),
        );
      }),
    ),
    new Epoch(new ConnectionManagerData()),
  );

  return { connectionManagerData$ };
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
