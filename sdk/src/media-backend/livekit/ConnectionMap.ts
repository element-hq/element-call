/*
Copyright 2025-2026 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RemoteParticipant } from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { combineLatest, map, of, switchMap, tap } from "rxjs";

import { type Behavior } from "../../reactive/Behavior";
import {
  Epoch,
  mapEpoch,
  type ObservableScope,
} from "../../reactive/ObservableScope";
import { generateItemsWithEpoch } from "../../reactive/observable";
import { type ConnectionRole, type TransportLocator } from "./auth";
import { type Connection } from "./Connection";
import { type ConnectionFactory } from "./ConnectionFactory";
import { type LivekitRooms } from "./LivekitRooms";

// Branded, so that only values returned by `keyFor` can be used as keys
export type TransportKey = string & { __transportKey: true };

/**
 * The key a locator is identified by in a map or set. Locators with the same
 * key share a connection: the server name only takes part in authentication
 * for a transport with a `url`, where our homeserver asks that server for the
 * token. A JWT service is reached directly, so members of several homeservers
 * advertising the same one share a connection rather than each get their own.
 */
export function keyFor({
  transport,
  serverName,
}: TransportLocator): TransportKey {
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

/**
 * The connections at one moment, with the remote participants seen on each.
 * A transport whose connection waits for a room another connection holds
 * reads that room through the holder.
 */
export class ConnectionMap {
  private readonly map = new Map<
    TransportKey,
    { connection: Connection; participants: RemoteParticipant[] }
  >();
  private readonly holders = new Map<TransportKey, TransportKey>();

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

  /** Routes a transport's lookups through the connection holding its room. */
  public alias(connection: Connection, holder: Connection): void {
    this.holders.set(keyFor(connection), keyFor(holder));
  }

  public getConnections(): Connection[] {
    return Array.from(this.map.values()).map(({ connection }) => connection);
  }

  /** The connection a transport's media arrives on or null while it has none. */
  public getConnectionForTransport(
    transport: TransportLocator,
  ): Connection | null {
    return this.entryFor(transport)?.connection ?? null;
  }

  public getParticipantsForTransport(
    transport: TransportLocator,
  ): RemoteParticipant[] {
    return this.entryFor(transport)?.participants ?? [];
  }

  private entryFor(
    transport: TransportLocator,
  ): { connection: Connection; participants: RemoteParticipant[] } | undefined {
    const key = keyFor(transport);
    return this.map.get(this.holders.get(key) ?? key);
  }
}

interface Props {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  /** The transport we publish on; the one connection with the publisher role. */
  localTransport: TransportLocator;
  /** Every transport some member is on, deduplicated against the local one. */
  remoteTransports$: Behavior<Epoch<TransportLocator[]>>;
  /** The room / connection mapping. */
  rooms: LivekitRooms;
  logger: Logger;
  ownMembershipIdentity: CallMembershipIdentityParts;
}

/**
 * One connection per transport in use by one or more session members, with
 * the remote participants each one sees. The connections start as they are
 * created and stop as their transport drops out of the list. Transports that
 * resolve to one LiveKit room share the connection holding it.
 */
export function createConnectionMap$({
  scope,
  connectionFactory,
  localTransport,
  remoteTransports$,
  rooms,
  logger: parentLogger,
  ownMembershipIdentity,
}: Props): Behavior<Epoch<ConnectionMap>> {
  const logger = parentLogger.getChild("[ConnectionMap]");

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

  const connections$ = scope.behavior(
    localAndRemoteTransports$.pipe(
      generateItemsWithEpoch(
        "ConnectionMap connections$",
        function* (transports) {
          for (const transport of transports) {
            const role: ConnectionRole =
              keyFor(transport) === localTransportKey
                ? "publisher"
                : "subscriber";
            // The locator is an object, so a stable key stands in for it
            yield { keys: [role, keyFor(transport)], data: transport };
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
          scope.onEnd(() => rooms.forget(connection));
          // The state carries the progress, errors included
          void connection.start();
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
        const participants$ = combineLatest(
          connections.map((connection) =>
            connection.remoteParticipants$.pipe(
              map((participants) => ({ connection, participants })),
            ),
          ),
        );
        return combineLatest(
          [participants$, rooms.holders$],
          (list, holders) => {
            const map = new ConnectionMap(logger);
            for (const { connection, participants } of list) {
              map.add(connection, participants);
              const holder = holders.get(connection);
              if (holder !== undefined && holder !== connection)
                map.alias(connection, holder);
            }
            return new Epoch(map, epoch);
          },
        );
      }),
    ),
  );
}
