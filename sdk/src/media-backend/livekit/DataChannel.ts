/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type RemoteParticipant,
  type Room as LivekitRoom,
  RoomEvent,
} from "livekit-client";
import {
  distinctUntilChanged,
  filter,
  fromEvent,
  map,
  merge,
  type Observable,
  share,
  switchMap,
} from "rxjs";

import { type Behavior } from "../../reactive/Behavior";
import { type ObservableScope } from "../../reactive/ObservableScope";
import { type DataPacket } from "../api";
import { type Connection, ConnectionState } from "./Connection";
import { type IConnectionManager } from "./ConnectionManager";

interface Props {
  scope: ObservableScope;
  connectionManager: IConnectionManager;
  /** The local member's connection, which carries what we send. */
  connection$: Behavior<Connection | null>;
}

export interface DataChannel {
  data$: Observable<DataPacket>;
  sendData: (topic: string, text: string) => Promise<void>;
}

/**
 * A text channel beside the media: LiveKit's reliable data packets, received
 * on every connection the client holds and sent on the local member's. The
 * sender is reported by its identity; the packet's own claim of who sent it
 * never reaches the host.
 */
export function createDataChannel$({
  scope,
  connectionManager,
  connection$,
}: Props): DataChannel {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const rooms$ = connectionManager.connectionManagerData$.pipe(
    map(({ value }) => value.getConnections().map((c) => c.livekitRoom)),
    distinctUntilChanged(
      (a, b) => a.length === b.length && a.every((room, i) => room === b[i]),
    ),
  );

  const data$ = rooms$.pipe(
    switchMap((rooms) => merge(...rooms.map(receivedOn))),
    map(({ payload, participant, topic }): DataPacket | null =>
      // Only the server sends without a participant; a host has no use for it
      participant === undefined
        ? null
        : {
            senderId: participant.identity,
            topic: topic ?? "",
            text: decoder.decode(payload),
          },
    ),
    filter((packet) => packet !== null),
    scope.bind(),
    share(),
  );

  const sendData = async (topic: string, text: string): Promise<void> => {
    const connection = connection$.value;
    if (connection?.state$.value !== ConnectionState.LivekitConnected)
      throw new Error("Cannot send data: the local transport is not connected");
    await connection.livekitRoom.localParticipant.publishData(
      encoder.encode(text),
      { reliable: true, topic },
    );
  };

  return { data$, sendData };
}

interface Received {
  payload: Uint8Array;
  participant: RemoteParticipant | undefined;
  topic: string | undefined;
}

function receivedOn(room: LivekitRoom): Observable<Received> {
  return fromEvent(
    room,
    RoomEvent.DataReceived,
    (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ): Received => ({ payload, participant, topic }),
  );
}
