/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { distinctUntilChanged, map } from "rxjs";

import { type Behavior } from "../reactive/Behavior";
import { type ObservableScope } from "../reactive/ObservableScope";
import { type TransportMetadata } from "../api";
import { type MediaBackend, MediaConnectionState } from "../backend/api";

export interface TransportRegistry {
  /** The one `TransportMetadata` for a transport, however many memberships name it. */
  get(raw: Transport): TransportMetadata;
  /** Transports with a live connection. */
  connected$: Behavior<TransportMetadata[]>;
}

export function createTransportRegistry(
  scope: ObservableScope,
  connections$: MediaBackend["connections$"],
): TransportRegistry {
  const transports = new Map<string, TransportMetadata>();

  const get = (raw: Transport): TransportMetadata => {
    const id = transportId(raw);
    let transport = transports.get(id);
    if (transport === undefined) {
      transport = createTransportMetadata(scope, connections$, raw, id);
      transports.set(id, transport);
    }
    return transport;
  };

  const connected$ = scope.behavior(
    connections$.pipe(
      map((connections) =>
        connections
          .filter(({ state }) => state === MediaConnectionState.Connected)
          .map(({ transport }) => get(transport)),
      ),
    ),
  );

  return { get, connected$ };
}

function createTransportMetadata(
  scope: ObservableScope,
  connections$: MediaBackend["connections$"],
  raw: Transport,
  id: string,
): TransportMetadata {
  return {
    type: raw.type,
    id,
    raw,
    resolved$: scope.behavior(
      connections$.pipe(
        map(
          (connections) =>
            connections.find((c) => transportId(c.transport) === id)?.resolved,
        ),
        distinctUntilChanged(),
      ),
    ),
  };
}

/**
 * Transports are plain JSON out of membership events, so the same transport
 * serialises the same way wherever it appears. Keys are sorted so that the
 * order a sender wrote them in does not matter.
 */
export function transportId(raw: Transport): string {
  return JSON.stringify(raw, Object.keys(raw).sort());
}
