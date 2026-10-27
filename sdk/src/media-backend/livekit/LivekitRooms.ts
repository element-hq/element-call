/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";
import { BehaviorSubject } from "rxjs";

import { type Behavior } from "../../reactive/Behavior";
import { type Connection } from "./Connection";

// Branded, so that only values returned by `livekitRoomKey` can be used as keys.
export type LivekitRoomKey = string & { __livekitRoomKey: true };

/** A LiveKit room identified by the SFU it is on and its alias there. */
export function livekitRoomKey(url: string, alias: string): LivekitRoomKey {
  return JSON.stringify([normalisedUrl(url), alias]) as LivekitRoomKey;
}

/** Normalises URLs to make them comparable. */
function normalisedUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/** A room some connection has resolved to, and who is on it. */
interface Room {
  /** The one connection joined to the room on the SFU. */
  holder: Connection;
  /** Connections waiting to hold the room, in the order they will get it. */
  waiting: Waiter[];
}

/** A connection's pending claim on a room. */
interface Waiter {
  /**
   * The connection that resolved to the room and is not connecting until it
   * holds it.
   */
  connection: Connection;
  /**
   * Settles the connection's claim after it has either acquired hold of the
   * room or was released.
   */
  held: () => void;
}

/** Helper to organise rooms and holding or waiting connections. */
export class LivekitRooms {
  private readonly logger: Logger;
  /** The rooms some connection is on or waiting for. */
  private readonly rooms = new Map<LivekitRoomKey, Room>();
  /** The room each connection resolved to. */
  private readonly roomOf = new Map<Connection, LivekitRoomKey>();
  /** The source of `holders$`. */
  private readonly holders = new BehaviorSubject<Map<Connection, Connection>>(
    new Map(),
  );
  /** Every connection that resolved a room, to the connection holding that room. */
  public readonly holders$: Behavior<Map<Connection, Connection>> =
    this.holders;

  public constructor(parentLogger: Logger) {
    this.logger = parentLogger.getChild("[LivekitRooms]");
  }

  /** The connection holding a room, if any does. */
  public holderOf(key: LivekitRoomKey): Connection | undefined {
    return this.rooms.get(key)?.holder;
  }

  /**
   * Resolves once `connection` either holds the room or was released.
   * Resolves to whether the connection had to wait for the room.
   */
  public async claim(
    connection: Connection,
    key: LivekitRoomKey,
  ): Promise<boolean> {
    this.roomOf.set(connection, key);
    const room = this.rooms.get(key);
    if (room === undefined) {
      this.logger.debug(`${describe(connection)} holds room ${key}`);
      this.rooms.set(key, { holder: connection, waiting: [] });
      this.publish();
      return false;
    }
    // If the connection is for publishing and a subscriber holds the room, demote it.
    if (connection.role === "publisher") {
      const demoted = room.holder;
      this.logger.info(
        `${describe(connection)} takes room ${key} over from ${describe(demoted)}, which stops`,
      );
      room.holder = connection;
      this.publish();
      void demoted.stop();
      return false;
    }
    this.logger.info(
      `${describe(connection)} waits for room ${key}, held by ${describe(room.holder)}`,
    );
    await new Promise<void>((held) => {
      room.waiting.push({ connection, held });
      this.publish();
    });
    return true;
  }

  /** Gives up holding or waiting for the room. */
  public release(connection: Connection): void {
    const key = this.roomOf.get(connection);
    const room = key === undefined ? undefined : this.rooms.get(key);
    if (key === undefined || room === undefined) {
      return; // Never claimed, or the room has already emptied out
    }
    if (room.holder === connection) {
      // We're the room's holder. Figure out the first waiter and promote it.
      const next = room.waiting.shift();
      if (next === undefined) {
        this.rooms.delete(key);
      } else {
        this.logger.info(
          `${describe(next.connection)} holds room ${key} now, released by ${describe(connection)}`,
        );
        room.holder = next.connection;
        next.held();
      }
    } else {
      // We're a waiter. Figure out our index in the waiting list to remove ourselves.
      const index = room.waiting.findIndex((w) => w.connection === connection);
      if (index === -1) {
        return;
      }
      const [{ held }] = room.waiting.splice(index, 1);
      held();
    }
    this.publish();
  }

  /** Releases a connection that is gone for good, so nothing reads through it. */
  public forget(connection: Connection): void {
    this.release(connection);
    this.roomOf.delete(connection);
    this.publish();
  }

  /** Emits `holders$` afresh if needed. */
  private publish(): void {
    const holders = new Map<Connection, Connection>();
    for (const [connection, key] of this.roomOf) {
      const holder = this.rooms.get(key)?.holder;
      if (holder !== undefined) holders.set(connection, holder);
    }
    if (!sameHolders(this.holders.value, holders)) this.holders.next(holders);
  }
}

/** Checks if two holder maps are identical. */
function sameHolders(
  a: Map<Connection, Connection>,
  b: Map<Connection, Connection>,
): boolean {
  return (
    a.size === b.size &&
    [...a].every(([connection, holder]) => b.get(connection) === holder)
  );
}

/** Summarises a connection for logging. */
function describe(connection: Connection): string {
  return `${connection.role} connection to ${JSON.stringify(connection.transport)}`;
}
