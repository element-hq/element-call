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

export class ConnectionManagerData {
  private readonly store: Map<
    string,
    { connection: Connection; participants: RemoteParticipant[] }
  > = new Map();

  public constructor(private readonly logger?: Logger) {}

  public add(connection: Connection, participants: RemoteParticipant[]): void {
    const key = this.getKey(connection);
    const existing = this.store.get(key);
    if (!existing) {
      this.store.set(key, { connection, participants });
    } else {
      // Transports are deduplicated by URL upstream, so this should never
      // happen; if it does, members may be matched against the wrong room.
      this.logger?.warn(
        `Merging participants from a second connection to ${key}: existing [${existing.participants.map((p) => p.identity).join(", ")}], adding [${participants.map((p) => p.identity).join(", ")}]`,
      );
      existing.participants.push(...participants);
    }
  }

  private getKey({ transport, serverName }: TransportLocator): string {
    // This is enough as a key because the ConnectionManager is already scoped by room.
    // We also do not need to consider the slotId at this point since each `MatrixRTCSession` is already scoped by `slotDescription: {id, application}`.
    return JSON.stringify([
      "url" in transport ? transport.url : undefined,
      "livekit_service_url" in transport
        ? transport.livekit_service_url
        : undefined,
      serverName,
    ]);
  }

  public getConnections(): Connection[] {
    return Array.from(this.store.values()).map(({ connection }) => connection);
  }

  public getConnectionForTransport(
    transport: TransportLocator,
  ): Connection | null {
    return this.store.get(this.getKey(transport))?.connection ?? null;
  }

  public getParticipantsForTransport(
    transport: TransportLocator,
  ): RemoteParticipant[] {
    const key = this.getKey(transport);
    const existing = this.store.get(key);
    if (existing) {
      return existing.participants;
    }
    return [];
  }
}

/**
 * Unpacks an {@link UnstableLivekitTransport} into its constituent `url` and
 * `serviceUrl`, discarding the type information that at least one of them must
 * be defined.
 */
function unpackTransport(transport: UnstableLivekitTransport): {
  url: string | undefined;
  serviceUrl: string | undefined;
} {
  return {
    url: "url" in transport ? transport.url : undefined,
    serviceUrl:
      "livekit_service_url" in transport
        ? transport.livekit_service_url
        : undefined,
  };
}

/**
 * Constructs an {@link UnstableLivekitTransport} from its constituent `url` and
 * `serviceUrl`. This assumes that at least one of the two are defined.
 */
function repackTransport(
  url: string | undefined,
  serviceUrl: string | undefined,
): UnstableLivekitTransport {
  return {
    type: "livekit",
    ...(url === undefined ? {} : { url }),
    ...(serviceUrl === undefined ? {} : { livekit_service_url: serviceUrl }),
  } as UnstableLivekitTransport;
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
 * @param props.localTransport$ - The transport to publish local media on. (deduplicated with remoteTransports$)
 * @param props.remoteTransports$ - All other transports. The connection manager will create connections for each transport. (deduplicated with localTransport$)
 * @param props.ownMembershipIdentity - The own membership identity to use.
 * @param props.logger - The logger to use.

 *
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
          removeDuplicateLocators([localTransport, ...remoteTransports]),
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
        "ConnectionManager connections$",
        function* (transports) {
          for (const { transport, serverName } of transports) {
            const role =
              serverName === localTransport.serverName &&
              areUnstableLivekitTransportsEqual(
                transport,
                localTransport.transport,
              )
                ? ("publisher" as const)
                : ("subscriber" as const);
            // In order to maintain a consistent set of map keys, we must
            // temporarily downgrade `transport` to a weaker type
            const { url, serviceUrl } = unpackTransport(transport);
            yield {
              keys: [role, url, serviceUrl, serverName],
              data: undefined,
            };
          }
        },
        (scope, _data$, role, url, serviceUrl, serverName) => {
          const connection = connectionFactory.createConnection(
            scope,
            role,
            // Pack the transport keys back into a stronger
            // `UnstableLivekitTransport` type
            repackTransport(url, serviceUrl),
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

// TODO add this to the JS-SDK
export function areUnstableLivekitTransportsEqual<
  T extends UnstableLivekitTransport,
>(t1: T | null, t2: T | null): boolean {
  if (t1 && t2) {
    if ("url" in t1 !== "url" in t2) return false;
    if ("livekit_service_url" in t1 !== "livekit_service_url" in t2)
      return false;
    if (
      "url" in t1 &&
      t1.url !== (t2 as UnstableLivekitTransport & { url: string }).url
    )
      return false;
    if (
      "livekit_service_url" in t1 &&
      t1.livekit_service_url !==
        (t2 as UnstableLivekitTransport & { livekit_service_url: string })
          .livekit_service_url
    )
      return false;
    return true;
  }
  return !t1 && !t2;
}

function removeDuplicateLocators(
  locators: TransportLocator[],
): TransportLocator[] {
  // Set tracking which locators we have added to `deduped` so far
  // url -> serviceUrl -> serverNames
  const byUrl = new Map<
    string | undefined,
    Map<string | undefined, Set<string>>
  >();
  const deduped: TransportLocator[] = [];

  for (const locator of locators) {
    const { transport, serverName } = locator;
    const url = "url" in transport ? transport.url : undefined;
    const serviceUrl =
      "livekit_service_url" in transport
        ? transport.livekit_service_url
        : undefined;

    let byServiceUrl = byUrl.get(url);
    if (byServiceUrl === undefined) {
      byServiceUrl = new Map();
      byUrl.set(url, byServiceUrl);
    }
    let serverNames = byServiceUrl.get(serviceUrl);
    if (serverNames === undefined) {
      serverNames = new Set();
      byServiceUrl.set(serviceUrl, serverNames);
    }
    if (!serverNames.has(serverName)) {
      serverNames.add(serverName);
      deduped.push(locator);
    }
  }

  return deduped;
}
