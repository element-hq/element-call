/*
Copyright 2025 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest, map, of, switchMap, tap } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type RemoteParticipant } from "livekit-client";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { type Behavior } from "../../Behavior.ts";
import { type Connection } from "./Connection.ts";
import {
  Epoch,
  mapEpoch,
  type ObservableScope,
} from "../../ObservableScope.ts";
import { generateItemsWithEpoch } from "../../../utils/observable.ts";
import { type ConnectionFactory } from "./ConnectionFactory.ts";
import { type TransportLocator } from "../../../livekit/auth/types.ts";

// Branded string type, to enforce that `fromKey` must only be called with
// values returned by `keyFor`
export type TransportKey = string & { __transportKey: true };

/**
 * Converts a {@link TransportLocator} to a key suitable for identifying it in a
 * {@link Map} or {@link Set}.
 */
export function keyFor({
  transport,
  serverName,
}: TransportLocator): TransportKey {
  // Serialize the fields in a consistent order
  return JSON.stringify([
    "url" in transport ? transport.url : null,
    "livekit_service_url" in transport ? transport.livekit_service_url : null,
    serverName,
  ]) as TransportKey;
}

/**
 * Inverse of {@link keyFor}: turns a key back into a {@link TransportLocator}.
 */
export function fromKey(key: TransportKey): TransportLocator {
  const [url, serviceUrl, serverName] = JSON.parse(key);
  return {
    transport: {
      type: "livekit",
      ...(url === null ? {} : { url }),
      ...(serviceUrl === null ? {} : { livekit_service_url: serviceUrl }),
    } as UnstableLivekitTransport,
    serverName,
  };
}

function removeDuplicateTransports(
  transports: TransportLocator[],
): TransportLocator[] {
  const map = new Map<TransportKey, TransportLocator>();
  for (const transport of transports) map.set(keyFor(transport), transport);
  return [...map.values()];
}

export class ConnectionManagerData {
  private readonly store: Map<
    TransportKey,
    { connection: Connection; participants: RemoteParticipant[] }
  > = new Map();

  public constructor(private readonly logger?: Logger) {}

  public add(connection: Connection, participants: RemoteParticipant[]): void {
    const key = keyFor(connection);
    const existing = this.store.get(key);
    if (!existing) {
      this.store.set(key, { connection, participants });
    } else {
      // Transports are deduplicated by key upstream, so this should never
      // happen; if it does, members may be matched against the wrong room.
      this.logger?.warn(
        `Merging participants from a second connection to ${key}: existing [${existing.participants.map((p) => p.identity).join(", ")}], adding [${participants.map((p) => p.identity).join(", ")}]`,
      );
      existing.participants.push(...participants);
    }
  }

  public getConnections(): Connection[] {
    return Array.from(this.store.values()).map(({ connection }) => connection);
  }

  public getConnectionForTransport(
    transport: TransportLocator,
  ): Connection | null {
    return this.store.get(keyFor(transport))?.connection ?? null;
  }

  public getParticipantsForTransport(
    transport: TransportLocator,
  ): RemoteParticipant[] {
    const existing = this.store.get(keyFor(transport));
    if (existing) {
      return existing.participants;
    }
    return [];
  }
}

interface Props {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  localTransport: TransportLocator;
  remoteTransports$: Behavior<Epoch<TransportLocator[]>>;

  logger: Logger;
  ownMembershipIdentity: CallMembershipIdentityParts;
}

// TODO - write test for scopes (do we really need to bind scope)
export interface IConnectionManager {
  connectionManagerData$: Behavior<Epoch<ConnectionManagerData>>;
}

/**
 * Crete a `ConnectionManager`
 * @param props - Configuration object
 * @param props.scope - The observable scope used by this object
 * @param props.connectionFactory - Used to create new connections
 * @param props.localTransport - The transport to publish local media on. (deduplicated with remoteTransports$)
 * @param props.remoteTransports$ - All other transports. The connection manager will create connections for each transport. (deduplicated with localTransport)
 * @param props.ownMembershipIdentity - The own membership identity to use.
 * @param props.logger - The logger to use.
 */
export function createConnectionManager$({
  scope,
  connectionFactory,
  localTransport,
  remoteTransports$,
  logger: parentLogger,
  ownMembershipIdentity,
}: Props): IConnectionManager {
  const logger = parentLogger.getChild("[ConnectionManager]");
  // TODO logger: only construct one logger from the client and make it compatible via a EC specific sing

  /**
   * All transports currently managed by the ConnectionManager. This list does
   * not include duplicate transports.
   */
  const localAndRemoteTransports$: Behavior<Epoch<TransportLocator[]>> =
    scope.behavior(
      remoteTransports$.pipe(
        mapEpoch((remoteTransports) =>
          removeDuplicateTransports([localTransport, ...remoteTransports]),
        ),
        tap((transports) =>
          logger.debug("localAndRemoteTransports$ = ", transports),
        ),
      ),
    );

  const localTransportKey = keyFor(localTransport);

  /**
   * Connections for each transport in use by one or more session members.
   */
  const connections$ = scope.behavior(
    localAndRemoteTransports$.pipe(
      generateItemsWithEpoch(
        "ConnectionManager connections$",
        function* (transports) {
          for (const transport of transports) {
            const role =
              keyFor(transport) === localTransportKey
                ? ("publisher" as const)
                : ("subscriber" as const);
            yield {
              // In order to maintain a static set of map keys, we must
              // temporarily serialize `transport` into a stable key format
              keys: [role, keyFor(transport)],
              data: undefined,
            };
          }
        },
        (scope, _data$, role, transportKey) => {
          const { transport, serverName } = fromKey(transportKey);
          const connection = connectionFactory.createConnection(
            scope,
            role,
            transport,
            serverName,
            ownMembershipIdentity,
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
                }, new ConnectionManagerData(logger)),
                epoch,
              ),
          ),
        );
      }),
    ),
    new Epoch(new ConnectionManagerData(), -1),
  );

  return { connectionManagerData$ };
}
