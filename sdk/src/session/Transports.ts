/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  isLivekitTransport,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest, distinctUntilChanged, map, of, switchMap } from "rxjs";

import { constant, type Behavior } from "../../../src/state/Behavior";
import { type ObservableScope } from "../../../src/state/ObservableScope";
import { ConnectionState } from "../../../src/state/CallViewModel/remoteMembers/Connection";
import { type IConnectionManager } from "../../../src/state/CallViewModel/remoteMembers/ConnectionManager";
import { type TransportMetadata } from "../api";
import { ResolvedConnection } from "./ConnectionFactory";

export interface TransportRegistry {
  /** The one `TransportMetadata` for a transport, however many memberships name it. */
  get(raw: Transport): TransportMetadata;
  /** Transports with a live connection. */
  connected$: Behavior<TransportMetadata[]>;
}

export function createTransportRegistry(
  scope: ObservableScope,
  connectionManager: IConnectionManager,
): TransportRegistry {
  const transports = new Map<string, TransportMetadata>();

  const get = (raw: Transport): TransportMetadata => {
    const id = transportId(raw);
    let transport = transports.get(id);
    if (transport === undefined) {
      transport = createTransportMetadata(scope, connectionManager, raw, id);
      transports.set(id, transport);
    }
    return transport;
  };

  const connected$ = scope.behavior(
    connectionManager.connectionManagerData$.pipe(
      switchMap(({ value }) => {
        const connections = value.getConnections();
        if (connections.length === 0) return of([]);
        return combineLatest(
          connections.map((connection) =>
            connection.state$.pipe(
              map((state) =>
                state === ConnectionState.LivekitConnected
                  ? get(connection.transport)
                  : null,
              ),
            ),
          ),
        ).pipe(map((transports) => transports.filter((t) => t !== null)));
      }),
    ),
  );

  return { get, connected$ };
}

function createTransportMetadata(
  scope: ObservableScope,
  connectionManager: IConnectionManager,
  raw: Transport,
  id: string,
): TransportMetadata {
  const resolved$ = isLivekitTransport(raw)
    ? scope.behavior(
        connectionManager.connectionManagerData$.pipe(
          map(({ value }) => value.getConnectionForTransport(raw)),
          distinctUntilChanged(),
          switchMap((connection) =>
            connection instanceof ResolvedConnection
              ? connection.resolved$
              : of(undefined),
          ),
        ),
      )
    : constant(undefined);
  return { type: raw.type, id, raw, resolved$ };
}

function transportId(raw: Transport): string {
  return isLivekitTransport(raw)
    ? raw.livekit_service_url
    : JSON.stringify(raw);
}
