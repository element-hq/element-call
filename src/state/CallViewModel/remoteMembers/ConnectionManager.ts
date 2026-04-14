/*
Copyright 2025 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LivekitTransportConfig } from "matrix-js-sdk/lib/matrixrtc";
import {
  combineLatest,
  map,
  type Observable,
  of,
  scan,
  switchMap,
} from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type RemoteParticipant } from "livekit-client";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";

import { type Behavior } from "../../Behavior.ts";
import { type Connection } from "./Connection.ts";
import { Epoch, type ObservableScope } from "../../ObservableScope.ts";
import { areLivekitTransportsEqual } from "./MatrixLivekitMembers.ts";
import { type ConnectionFactory } from "./ConnectionFactory.ts";
import {
  type LocalTransportWithSFUConfig,
} from "../localMember/LocalTransport.ts";

export class ConnectionManagerData {
  private readonly store: Map<
    string,
    { connection: Connection; participants: RemoteParticipant[] }
  > = new Map();

  public constructor() {}

  public add(connection: Connection, participants: RemoteParticipant[]): void {
    const key = this.getKey(connection.transport);
    const existing = this.store.get(key);
    if (!existing) {
      this.store.set(key, { connection, participants });
    } else {
      existing.participants.push(...participants);
    }
  }

  private getKey(transport: LivekitTransportConfig): string {
    // This is enough as a key because the ConnectionManager is already scoped by room.
    // We also do not need to consider the slotId at this point since each `MatrixRTCSession` is already scoped by `slotDescription: {id, application}`.
    return transport.livekit_service_url;
  }

  public getConnections(): Connection[] {
    return Array.from(this.store.values()).map(({ connection }) => connection);
  }

  public getConnectionForTransport(
    transport: LivekitTransportConfig,
  ): Connection | null {
    return this.store.get(this.getKey(transport))?.connection ?? null;
  }

  public getParticipantsForTransport(
    transport: LivekitTransportConfig,
  ): RemoteParticipant[] {
    const key = this.getKey(transport);
    const existing = this.store.get(key);
    if (existing) {
      return existing.participants;
    }
    return [];
  }
}

interface Props {
  scope: ObservableScope;
  connectionFactory: ConnectionFactory;
  localTransport$: Behavior<LocalTransportWithSFUConfig | null>;
  remoteTransports$: Behavior<Epoch<LivekitTransportConfig[]>>;

  logger: Logger;
  ownMembershipIdentity: CallMembershipIdentityParts;
}

export interface IConnectionManager {
  connectionManagerData$: Behavior<Epoch<ConnectionManagerData>>;
}

/**
 * Incremental state based on prev/current transports and connections.
 */
interface ScannedState {
  managedTransports: LivekitTransportConfig[];
  managedConnections: Connection[];
  epoch: number;
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
  localTransport$,
  remoteTransports$,
  logger: parentLogger,
  ownMembershipIdentity,
}: Props): IConnectionManager {
  const logger = parentLogger.getChild("[ConnectionManager]");

  // De-duplicate the list of transports and flatten it into a single list.
  // The connection manager should only create one connection per unique transport config,
  // even if multiple session members are using the same transport.
  const localAndRemoteTransports$ = getLocalAndRemoteTransports$(
    scope,
    remoteTransports$,
    localTransport$,
  );

  // Create and start connections for each transport.
  // Incrementally checks for new and removed transports and stop and remove connections accordingly.
  const state$ = scanInternalState$(
    scope,
    localAndRemoteTransports$,
    ownMembershipIdentity,
    connectionFactory,
    logger,
  );

  const connectionManagerData$ = state$.pipe(
    switchMap((state) => {
      // Map each connection to a stream of {connection, participants}
      const connectionWithParticipants$ = state.managedConnections.map(
        (connection) => {
          return connection.remoteParticipants$.pipe(
            map((participants) => ({
              connection,
              participants,
            })),
          );
        },
      );

      // Handle empty case
      if (connectionWithParticipants$.length === 0) {
        return of(new Epoch(new ConnectionManagerData(), state.epoch));
      }

      // Combine all the streams and reduce into ConnectionManagerData
      return combineLatest(connectionWithParticipants$).pipe(
        map((items) => {
          const data = new ConnectionManagerData();
          items.forEach(({ connection, participants }) => {
            data.add(connection, participants);
          });
          return new Epoch(data, state.epoch);
        }),
      );
    }),
  );

  return { connectionManagerData$: scope.behavior(connectionManagerData$) };
}

/*
 Each member sends its transport as part of the MatrixRTC membership.
 The connection manager will create a connection for each unique transport,
 even if multiple session members are using the same transport.
 */
function removeDuplicateTransports<T extends LivekitTransportConfig>(
  transports: T[],
): T[] {
  return transports.reduce((acc, transport) => {
    if (!acc.some((t) => areLivekitTransportsEqual(t, transport)))
      acc.push(transport);
    return acc;
  }, [] as T[]);
}

type TransportsData = {
  local: LocalTransportWithSFUConfig | null;
  remotes: LivekitTransportConfig[];
};
/**
 * All transports currently managed by the ConnectionManager.
 *
 * This list does not include duplicate transports.
 *
 * It is build based on the list of subscribed transports (`transportsSubscriptions$`).
 * externally this is modified via `registerTransports()`.
 */
function getLocalAndRemoteTransports$(
  scope: ObservableScope,
  remoteTransports$: Behavior<Epoch<LivekitTransportConfig[]>>,
  localTransport$: Behavior<LocalTransportWithSFUConfig | null>,
): Behavior<Epoch<TransportsData>> {
  return scope.behavior(
    combineLatest([remoteTransports$, localTransport$]).pipe(
      map(([remoteTransports, localTransport]) => {
        // Get the unique transports we have to connect to
        const dedupedRemote = removeDuplicateTransports(remoteTransports.value);

        // For clarity do not include the local transport in the remote list.
        const remoteWithoutLocal = dedupedRemote.filter(
          (transport) =>
            !areLivekitTransportsEqual(
              localTransport?.transport ?? null,
              transport,
            ),
        );
        return new Epoch(
          {
            local: localTransport,
            remotes: remoteWithoutLocal,
          },
          remoteTransports.epoch,
        );
      }),
    ),
  );
}

/**
 * Monitors the list of transports and creates and stops connections accordingly.
 *
 * It will automatically:
 * - Creates new connections when transports are added
 * - Removes and stops connections when transports are removed;
 *
 * Returns a state object that contains the list of managed transports and connections.
 */
function scanInternalState$(
  scope: ObservableScope,
  localAndRemoteTransports$: Behavior<Epoch<TransportsData>>,
  ownMembershipIdentity: CallMembershipIdentityParts,
  connectionFactory: ConnectionFactory,
  logger: Logger,
): Observable<ScannedState> {
  const initialState: ScannedState = {
    managedTransports: [],
    managedConnections: [],
    epoch: -1,
  };

  return localAndRemoteTransports$.pipe(
    scan((state: ScannedState, transportsEpoch) => {
      const transports = transportsEpoch.value;

      // XXX do we need to handle the case where a remote transport is promoted to local?
      // If so, we could add more info to the state and use that to decide whether to create a new connection or not.

      // Combine local and remote transports into one transport array
      const currentTransports = [
        ...(transports.local ? [transports.local.transport] : []),
        ...transports.remotes,
      ];

      // Find new and removed transports
      const { addedTransports, removedTransports } = computeTransportDiff(
        currentTransports,
        state.managedTransports,
      );

      if (removedTransports.length > 0) {
        logger.debug("Removed transports detected :", removedTransports);

        // stop connections for removed transports
        removedTransports.forEach((transport) => {
          const removedCo = state.managedConnections.find((connection) =>
            areLivekitTransportsEqual(connection.transport, transport),
          );
          if (removedCo) {
            void removedCo.stop();
          }
        });
      }

      // Remove all connections for removed transports
      const remainingConnections = state.managedConnections.filter(
        (connection) => {
          return !removedTransports.some((transport) =>
            areLivekitTransportsEqual(connection.transport, transport),
          );
        },
      );

      let addedConnections: Connection[] = [];
      if (addedTransports.length > 0) {
        logger.debug("New transports detected", addedTransports);

        addedConnections = addedTransports.map((transport) => {
          // let's create a connection for each transport
          const connection = connectionFactory.createConnection(
            scope,
            transport,
            ownMembershipIdentity,
            logger,
            transports.local?.transport?.livekit_service_url ===
              transport.livekit_service_url
              ? transports.local?.sfuConfig
              : undefined,
          );
          // start the connection immediately
          connection.start().catch((e) => {
            logger.error("Failed to start connection", e);
          });
          // TODO subscribe to connection state to retry or log issues?
          return connection;
        });
      }

      return {
        managedTransports: currentTransports,
        managedConnections: [...remainingConnections, ...addedConnections],
        epoch: transportsEpoch.epoch,
      };
    }, initialState),
  );
}

/**
 * Utility function to compute the difference between two lists of transports.
 * It returns the transports that are in the current list but not in the previous list (addedTransports)
 * and the transports that are in the previous list but not in the current list (removedTransports).
 * @param currentTransports - The current list of transports.
 * @param prevTransports - The previous list of transports.
 */
function computeTransportDiff(
  currentTransports: LivekitTransportConfig[],
  prevTransports: LivekitTransportConfig[],
): {
  addedTransports: LivekitTransportConfig[];
  removedTransports: LivekitTransportConfig[];
} {
  const newTransports = currentTransports.filter(
    (current) =>
      !prevTransports.some((prev) => areLivekitTransportsEqual(prev, current)),
  );

  const removedTransports = prevTransports.filter(
    (prev) =>
      !currentTransports.some((current) =>
        areLivekitTransportsEqual(prev, current),
      ),
  );
  return { addedTransports: newTransports, removedTransports };
}
