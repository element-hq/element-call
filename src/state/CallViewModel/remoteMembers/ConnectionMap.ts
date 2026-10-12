/*
Copyright 2025-2026 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
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
import { areLivekitTransportsEqual } from "./MatrixLivekitMembers.ts";
import { type ConnectionFactory } from "./ConnectionFactory.ts";

function removeDuplicateTransports<T extends LivekitTransport>(
  transports: T[],
): T[] {
  return transports.reduce((acc, transport) => {
    if (!acc.some((t) => areLivekitTransportsEqual(t, transport)))
      acc.push(transport);
    return acc;
  }, [] as T[]);
}

export class ConnectionMap {
  private readonly map = new Map<
    string,
    { connection: Connection; participants: RemoteParticipant[] }
  >();

  public constructor(private readonly logger?: Logger) {}

  public add(connection: Connection, participants: RemoteParticipant[]): void {
    const key = this.getKey(connection.transport);
    const existing = this.map.get(key);
    if (!existing) {
      this.map.set(key, { connection, participants });
    } else {
      // Transports are deduplicated by URL upstream, so this should never
      // happen; if it does, members may be matched against the wrong room.
      this.logger?.warn(
        `Merging participants from a second connection to ${key}: existing [${existing.participants.map((p) => p.identity).join(", ")}], adding [${participants.map((p) => p.identity).join(", ")}]`,
      );
      existing.participants.push(...participants);
    }
  }

  private getKey(transport: LivekitTransport): string {
    // This is enough as a key because the ConnectionMap is already scoped by room.
    // We also do not need to consider the slotId at this point since each `MatrixRTCSession` is already scoped by `slotDescription: {id, application}`.
    return transport.livekit_service_url;
  }

  public getConnections(): Connection[] {
    return Array.from(this.map.values()).map(({ connection }) => connection);
  }

  public getConnectionForTransport(
    transport: LivekitTransport,
  ): Connection | null {
    return this.map.get(this.getKey(transport))?.connection ?? null;
  }

  public getParticipantsForTransport(
    transport: LivekitTransport,
  ): RemoteParticipant[] {
    const existing = this.map.get(this.getKey(transport));
    if (existing) {
      return existing.participants;
    }
    return [];
  }
}

interface Props {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  localTransport: LivekitTransport;
  remoteTransports$: Behavior<Epoch<LivekitTransport[]>>;

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
  const localAndRemoteTransports$: Behavior<Epoch<LivekitTransport[]>> =
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

  /**
   * Connections for each transport in use by one or more session members.
   */
  const connections$ = scope.behavior(
    localAndRemoteTransports$.pipe(
      generateItemsWithEpoch(
        "ConnectionMap connections$",
        function* (transports) {
          for (const transport of transports) {
            const role = areLivekitTransportsEqual(transport, localTransport)
              ? ("publisher" as const)
              : ("subscriber" as const);
            yield {
              keys: [role, transport.livekit_service_url],
              data: undefined,
            };
          }
        },
        (scope, _data$, role, serviceUrl) => {
          const connection = connectionFactory.createConnection(
            scope,
            role,
            { type: "livekit", livekit_service_url: serviceUrl },
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
