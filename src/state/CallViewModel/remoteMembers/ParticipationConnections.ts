/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map, of, skip, switchMap } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../../Behavior";
import { Epoch, type ObservableScope, trackEpoch } from "../../ObservableScope";
import { generateItemsWithEpoch } from "../../../utils/observable";
import { type FfiConnectionWithMembers } from "../../../matrix-rtc-sdk";
import { type ConnectionFactory } from "./ConnectionFactory";
import {
  ConnectionManagerData,
  type IConnectionManager,
} from "./ConnectionManager";

/** What this module needs from a {@link CallParticipation}. */
export interface ParticipationConnectionsSource {
  /** The LiveKit rooms to hold, with a token for each, keyed by service URL. */
  connections$: Behavior<FfiConnectionWithMembers[]>;
}

interface Props {
  scope: ObservableScope;
  participation: ParticipationConnectionsSource;
  connectionFactory: ConnectionFactory;
  /** Who we publish as. Connections only log it; the tokens come minted. */
  ownIdentity: { userId: string; deviceId: string };
  logger: Logger;
}

/**
 * One LiveKit connection per transport the crate says the session uses — ours
 * and everybody else's — each started with the token the crate minted for
 * it. The crate discovers the transports, mints and refreshes the tokens;
 * this only turns its list into live `Connection`s, keyed by service URL so a
 * refreshed token does not tear a connection down.
 */
export function createParticipationConnectionManager$({
  scope,
  participation,
  connectionFactory,
  ownIdentity,
  logger: parentLogger,
}: Props): IConnectionManager {
  const logger = parentLogger.getChild("[ParticipationConnections]");

  const connections$ = scope.behavior(
    participation.connections$.pipe(
      trackEpoch(),
      generateItemsWithEpoch(
        "ParticipationConnections connections$",
        function* (connections) {
          for (const { connection } of connections) {
            yield {
              keys: [connection.serviceUrl] as const,
              data: { wsUrl: connection.wsUrl, jwt: connection.jwtToken },
            };
          }
        },
        (scope, token$, serviceUrl) => {
          const { wsUrl, jwt } = token$.value;
          const connection = connectionFactory.createConnection(
            scope,
            { type: "livekit", livekit_service_url: serviceUrl },
            { ...ownIdentity, memberId: "" },
            logger,
            // The crate minted this; nobody asks the authorisation service
            // again. The alias and identity are in the token itself.
            { url: wsUrl, jwt, livekitAlias: "", livekitIdentity: "" },
          );
          // A token the crate refreshed while we are connected is used on
          // the next full (re)connect; livekit-client keeps the session on
          // the token it connected with.
          // TODO: hand the new token to livekit-client when it can take one.
          token$.pipe(skip(1), scope.bind()).subscribe(() => {
            logger.info(
              `New token for ${serviceUrl}; it is used on the next connect`,
            );
          });
          // Start the connection immediately; its state$ tracks progress.
          void connection.start();
          return connection;
        },
      ),
    ),
    new Epoch([], -1),
  );

  const connectionManagerData$ = scope.behavior(
    connections$.pipe(
      switchMap((connections) => {
        const epoch = connections.epoch;
        if (connections.value.length === 0)
          return of(new Epoch(new ConnectionManagerData(), epoch));
        return combineLatest(
          connections.value.map((connection) =>
            connection.remoteParticipants$.pipe(
              map((participants) => ({ connection, participants })),
            ),
          ),
        ).pipe(
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
