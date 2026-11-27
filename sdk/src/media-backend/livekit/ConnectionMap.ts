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
import { chooseAuthFlow, type TransportLocator } from "./auth";
import { type Connection } from "./Connection";
import { type ConnectionFactory } from "./ConnectionFactory";

// Branded, so that only values returned by `keyFor` can be used as keys
type TransportKey = string & { __transportKey: true };

/**
 * Converts a {@link TransportLocator} to a key suitable for identifying it in a
 * map of connections.
 *
 * @param csApiUsable - Whether the map it is for uses the client-server API
 * where a transport leaves the choice.
 */
function keyFor(
  { transport, serverName }: TransportLocator,
  csApiUsable: boolean,
): TransportKey {
  // Base the key on the auth flow we would use, so that we never create two
  // connections that share the same auth details. (That would be bad, as we
  // might then try to connect to the same SFU twice with the same participant
  // ID, resulting in only one working connection.)
  const flow = chooseAuthFlow(transport, csApiUsable);
  // Serialize the fields in a consistent order
  return JSON.stringify([
    flow.kind,
    // With the CS API flow, we additionally need to distinguish server names
    ...(flow.kind === "csApi" ? [flow.url, serverName] : [flow.serviceUrl]),
  ]) as TransportKey;
}

/** The connections at one moment, with the remote participants seen on each. */
export class ConnectionMap {
  private readonly map = new Map<
    TransportKey,
    { connection: Connection; participants: RemoteParticipant[] }
  >();

  /**
   * @param csApiUsable - What the connections were keyed with.
   */
  public constructor(
    private readonly csApiUsable = true,
    private readonly logger?: Logger,
  ) {}

  public add(connection: Connection, participants: RemoteParticipant[]): void {
    const key = keyFor(connection, this.csApiUsable);
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
    const key = keyFor(transport, this.csApiUsable);
    return this.map.get(key)?.connection ?? null;
  }

  public getParticipantsForTransport(
    transport: TransportLocator,
  ): RemoteParticipant[] {
    const key = keyFor(transport, this.csApiUsable);
    return this.map.get(key)?.participants ?? [];
  }
}

interface Props {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  /** The transport we publish on; the one connection with the publisher role. */
  localTransport: TransportLocator;
  /** Every transport some member is on, deduplicated against the local one. */
  remoteTransports$: Behavior<Epoch<TransportLocator[]>>;
  /**
   * Whether a transport naming both a `url` and a `livekit_service_url` is
   * reached through the client-server API. Fixed for the life of the map.
   */
  csApiUsable: boolean;
  logger: Logger;
  ownMembershipIdentity: CallMembershipIdentityParts;
}

/**
 * One connection per transport in use by one or more session members, with
 * the remote participants each one sees. The connections start as they are
 * created and stop as their transport drops out of the list.
 */
export function createConnectionMap$({
  scope,
  connectionFactory,
  localTransport,
  remoteTransports$,
  csApiUsable,
  logger: parentLogger,
  ownMembershipIdentity,
}: Props): Behavior<Epoch<ConnectionMap>> {
  const logger = parentLogger.getChild("[ConnectionMap]");

  const transportsByKey$ = scope.behavior(
    remoteTransports$.pipe(
      mapEpoch(
        (remote) =>
          // The last locator wins a key, so the local one goes last
          new Map(
            [...remote, localTransport].map((transport) => [
              keyFor(transport, csApiUsable),
              transport,
            ]),
          ),
      ),
      tap(({ value }) =>
        logger.debug("transportsByKey$ = ", [...value.values()]),
      ),
    ),
  );

  const localTransportKey = keyFor(localTransport, csApiUsable);
  const connections$ = scope.behavior(
    transportsByKey$.pipe(
      generateItemsWithEpoch(
        "ConnectionMap connections$",
        // The locator is an object, so a stable key stands in for it
        (byKey) => Array.from(byKey, ([key, data]) => ({ keys: [key], data })),
        (scope, locator$, key) => {
          const { transport, serverName } = locator$.value;
          const connection = connectionFactory.createConnection(
            scope,
            key === localTransportKey ? "publisher" : "subscriber",
            transport,
            serverName,
            chooseAuthFlow(transport, csApiUsable),
            ownMembershipIdentity,
            logger,
          );
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
          return of(new Epoch(new ConnectionMap(csApiUsable), epoch));
        return combineLatest(
          connections.map((connection) =>
            connection.remoteParticipants$.pipe(
              map((participants) => ({ connection, participants })),
            ),
          ),
          (...list) => {
            const map = new ConnectionMap(csApiUsable, logger);
            for (const item of list)
              map.add(item.connection, item.participants);
            return new Epoch(map, epoch);
          },
        );
      }),
    ),
  );
}
