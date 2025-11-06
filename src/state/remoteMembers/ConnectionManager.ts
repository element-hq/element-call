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
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { type LocalParticipant, type RemoteParticipant } from "livekit-client";

import { type Behavior } from "../Behavior";
import { type Connection } from "./Connection";
import { type ObservableScope } from "../ObservableScope";
import { generateKeyed$ } from "../../utils/observable";
import { areLivekitTransportsEqual } from "./MatrixLivekitMembers";
import { type ConnectionFactory } from "./ConnectionFactory.ts";

export class ConnectionManagerData {
  private readonly store: Map<
    string,
    [Connection, (LocalParticipant | RemoteParticipant)[]]
  > = new Map();

  public constructor() {}

  public add(
    connection: Connection,
    participants: (LocalParticipant | RemoteParticipant)[],
  ): void {
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
  ): (LocalParticipant | RemoteParticipant)[] {
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
interface Props {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  inputTransports$: Behavior<LivekitTransport[]>;
}
// TODO - write test for scopes (do we really need to bind scope)

export interface ConnectionManagerReturn {
  deduplicatedTransports$: Behavior<LivekitTransport[]>;
  connectionManagerData$: Behavior<ConnectionManagerData>;
  connections$: Behavior<Connection[]>;
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
}: Props): ConnectionManagerReturn {
  const logger = rootLogger.getChild("ConnectionManager");

  const running$ = new BehaviorSubject(true);
  scope.onEnd(() => running$.next(false));
  // TODO logger: only construct one logger from the client and make it compatible via a EC specific sing

  /**
   * All transports currently managed by the ConnectionManager.
   *
   * This list does not include duplicate transports.
   *
   * It is build based on the list of subscribed transports (`transportsSubscriptions$`).
   * externally this is modified via `registerTransports()`.
   */
  const deduplicatedTransports$ = scope.behavior(
    combineLatest([running$, inputTransports$]).pipe(
      map(([running, transports]) => (running ? transports : [])),
      map(removeDuplicateTransports),
    ),
  );

  /**
   * Connections for each transport in use by one or more session members.
   */
  const connections$ = scope.behavior(
    generateKeyed$<LivekitTransport[], Connection, Connection[]>(
      deduplicatedTransports$,
      (transports, createOrGet) => {
        const createConnection =
          (
            transport: LivekitTransport,
          ): ((scope: ObservableScope) => Connection) =>
          (scope) => {
            const connection = connectionFactory.createConnection(
              transport,
              scope,
              logger,
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

  const connectionManagerData$: Behavior<ConnectionManagerData> =
    scope.behavior(
      connections$.pipe(
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
  return { deduplicatedTransports$, connectionManagerData$, connections$ };
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
