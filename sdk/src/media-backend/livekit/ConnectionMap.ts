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
import { Epoch, type ObservableScope } from "../../reactive/ObservableScope";
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
 
 * @param csApiUsable - The session's {@link CsApiSupport.usable}.
 */
export function keyFor(
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

function removeDuplicateTransports(
  transports: TransportLocator[],
  csApiUsable: boolean,
): TransportLocator[] {
  // The first locator wins, so the local one stays first in the list
  const map = new Map<TransportKey, TransportLocator>();
  for (const transport of transports) {
    const key = keyFor(transport, csApiUsable);
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

  /**
   * @param csApiUsable - The session's {@link CsApiSupport.usable}.
   */
  public constructor(
    private readonly csApiUsable = true,
    private readonly logger?: Logger,
  ) {}

  private keyFor(transport: TransportLocator): TransportKey {
    return keyFor(transport, this.csApiUsable);
  }

  public add(connection: Connection, participants: RemoteParticipant[]): void {
    const key = this.keyFor(connection);
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
    return this.map.get(this.keyFor(transport))?.connection ?? null;
  }

  public getParticipantsForTransport(
    transport: TransportLocator,
  ): RemoteParticipant[] {
    return this.map.get(this.keyFor(transport))?.participants ?? [];
  }
}

interface Props {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  /** The transport we publish on; the one connection with the publisher role. */
  localTransport: TransportLocator;
  /** Every transport some member is on, deduplicated against the local one. */
  remoteTransports$: Behavior<Epoch<TransportLocator[]>>;
  /** The session's {@link CsApiSupport.usable$} which the connection keys follow. */
  csApiUsable$: Behavior<boolean>;
  logger: Logger;
  ownMembershipIdentity: CallMembershipIdentityParts;
}

/**
 * One connection per transport in use by one or more session members, with
 * the remote participants each one sees. The connections start as they are
 * created and stop as their transport drops out of the list.
 *
 * If the client-server API turns out not to be usable, those transports that
 * can fall back to using the OpenID flow will change key. Their connections
 * are then replaced with new connections through the JWT service or fold into
 * existing connections through the JWT service.
 */
export function createConnectionMap$({
  scope,
  connectionFactory,
  localTransport,
  remoteTransports$,
  csApiUsable$,
  logger: parentLogger,
  ownMembershipIdentity,
}: Props): Behavior<Epoch<ConnectionMap>> {
  const logger = parentLogger.getChild("[ConnectionMap]");

  const localAndRemoteTransports$ = scope.behavior(
    combineLatest(
      [remoteTransports$, csApiUsable$],
      (remoteTransports, csApiUsable) =>
        remoteTransports.mapInner((remote) => ({
          transports: removeDuplicateTransports(
            [localTransport, ...remote],
            csApiUsable,
          ),
          csApiUsable,
        })),
    ).pipe(
      tap(({ value }) =>
        logger.debug("localAndRemoteTransports$ = ", value.transports),
      ),
    ),
  );

  const connections$ = scope.behavior(
    localAndRemoteTransports$.pipe(
      generateItemsWithEpoch(
        "ConnectionMap connections$",
        function* ({ transports, csApiUsable }) {
          const localTransportKey = keyFor(localTransport, csApiUsable);
          for (const transport of transports) {
            const key = keyFor(transport, csApiUsable);
            const role: ConnectionRole =
              key === localTransportKey ? "publisher" : "subscriber";
            // The locator is an object, so a stable key stands in for it
            yield { keys: [role, key], data: transport };
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
    // The connections are regenerated in the same tick as the answer they are
    // keyed under changes. So the two are always in step here.
    connections$.pipe(
      switchMap(({ value: connections, epoch }) => {
        const csApiUsable = csApiUsable$.value;
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
