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
import {
  chooseAuthFlow,
  type ConnectionRole,
  type TransportLocator,
} from "./auth";
import { type Connection } from "./Connection";
import { type ConnectionFactory } from "./ConnectionFactory";

// Branded, so that only values returned by `keyFor` can be used as keys
export type TransportKey = string & { __transportKey: true };

/**
 * Converts a {@link TransportLocator} to a key suitable for identifying it in a
 * map of connections.
 */
export function keyFor({
  transport,
  serverName,
}: TransportLocator): TransportKey {
  // Base the key on the auth flow we would use, so that we never create two
  // connections that share the same auth details. (That would be bad, as we
  // might then try to connect to the same SFU twice with the same participant
  // ID, resulting in only one working connection.)
  // TODO: This strategy will not work once `chooseAuthFlow` begins allowing for
  // falling back from the CS API flow to the OpenID flow.
  const flow = chooseAuthFlow(transport);
  // Serialize the fields in a consistent order
  return JSON.stringify([
    flow.kind,
    // With the CS API flow, we additionally need to distinguish server names
    ...(flow.kind === "csApi" ? [flow.url, serverName] : [flow.serviceUrl]),
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

/** The connections at one moment, with the remote participants seen on each. */
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
    return this.map.get(keyFor(transport))?.participants ?? [];
  }
}

interface Props {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  /** The transport we publish on; the one connection with the publisher role. */
  localTransport: TransportLocator;
  /** Every transport some member is on, deduplicated against the local one. */
  remoteTransports$: Behavior<Epoch<TransportLocator[]>>;
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
        return combineLatest(
          connections.map((connection) =>
            connection.remoteParticipants$.pipe(
              map((participants) => ({ connection, participants })),
            ),
          ),
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
