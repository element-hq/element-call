/*
Copyright 2025-2026 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

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

// Branded string type, so that only values returned by `keyFor` can be used
// as keys
export type TransportKey = string & { __transportKey: true };

/**
 * Converts a {@link TransportLocator} to a key suitable for identifying it in a
 * {@link Map} or {@link Set}. Locators with the same key share a connection.
 */
export function keyFor({
  transport,
  serverName,
}: TransportLocator): TransportKey {
  // The server name only takes part in authentication for a transport with a
  // `url`, where our homeserver asks that server for the token. A JWT service
  // is reached directly, so members of several homeservers advertising the
  // same one must share a connection rather than each get their own.
  const hasUrl = "url" in transport;
  // Serialize the fields in a consistent order
  return JSON.stringify([
    hasUrl ? transport.url : null,
    "livekit_service_url" in transport ? transport.livekit_service_url : null,
    hasUrl ? serverName : null,
  ]) as TransportKey;
}

function removeDuplicateTransports(
  transports: TransportLocator[],
): TransportLocator[] {
  // The first locator wins, so the local one stays first in the list
  const map = new Map<TransportKey, TransportLocator>();
  for (const transport of transports) {
    const key = keyFor(transport);
    if (!map.has(key)) map.set(key, transport);
  }
  return [...map.values()];
}

export class ConnectionMap {
  private readonly map = new Map<
    TransportKey,
    { connection: Connection; participants: RemoteParticipant[] }
  >();

  public constructor(private readonly logger?: Logger) {}

  public add(connection: Connection, participants: RemoteParticipant[]): void {
    const key = keyFor(connection);
    const existing = this.map.get(key);
    if (!existing) {
      this.map.set(key, { connection, participants });
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
    return Array.from(this.map.values()).map(({ connection }) => connection);
  }

  public getConnectionForTransport(
    transport: TransportLocator,
  ): Connection | null {
    return this.map.get(keyFor(transport))?.connection ?? null;
  }

  public getParticipantsForTransport(
    transport: TransportLocator,
  ): RemoteParticipant[] {
    const existing = this.map.get(keyFor(transport));
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

/**
 * Create a dynamic map of connections and their associated backend participants.
 * @param props - Configuration object
 * @param props.scope - The observable scope used by this object
 * @param props.connectionFactory - Used to create new connections
 * @param props.localTransport - The transport to publish local media on. (deduplicated with remoteTransports$)
 * @param props.remoteTransports$ - All other transports. The connection manager will create connections for each transport. (deduplicated with localTransport)
 * @param props.ownMembershipIdentity - The own membership identity to use.
 * @param props.logger - The logger to use.
 */
export function createConnectionMap$({
  scope,
  connectionFactory,
  localTransport,
  remoteTransports$,
  logger: parentLogger,
  ownMembershipIdentity,
}: Props): Behavior<Epoch<ConnectionMap>> {
  const logger = parentLogger.getChild("[ConnectionMap]");
  // TODO logger: only construct one logger from the client and make it compatible via a EC specific sing

  /**
   * All transports currently represented in the connection map. This list does
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
        "ConnectionMap connections$",
        function* (transports) {
          for (const transport of transports) {
            const role =
              keyFor(transport) === localTransportKey
                ? ("publisher" as const)
                : ("subscriber" as const);
            yield {
              // The locator is an object, so a stable key stands in for it
              keys: [role, keyFor(transport)],
              data: transport,
            };
          }
        },
        (scope, locator$, role, _key) => {
          const { transport, serverName } = locator$.value;
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

  return scope.behavior(
    connections$.pipe(
      switchMap(({ value: connections, epoch }) => {
        if (connections.length === 0)
          return of(new Epoch(new ConnectionMap(), epoch));

        return combineLatest(
          // Map the connections to list of Observable<{connection, participants}>
          connections.map((connection) =>
            connection.remoteParticipants$.pipe(
              map((participants) => ({ connection, participants })),
            ),
          ),
          // Collect into a single ConnectionMap
          (...list) => {
            const map = new ConnectionMap(logger);
            for (const item of list)
              map.add(item.connection, item.participants);
            return new Epoch(map, epoch);
          },
        );
      }),
    ),
  );
}
