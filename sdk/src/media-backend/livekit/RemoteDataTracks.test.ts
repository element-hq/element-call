/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import {
  type RemoteDataTrack,
  type Room as LivekitRoom,
  RoomEvent,
} from "livekit-client";
import { describe, expect, it } from "vitest";

import { remoteDataTracks$, watchRemoteDataTracks } from "./RemoteDataTracks";

const track = (sid: string): RemoteDataTrack =>
  ({ info: { sid }, publisherIdentity: "alice" }) as RemoteDataTrack;

describe("remoteDataTracks$", () => {
  it("keeps what the room announced before anyone observed it", () => {
    const emitter = new EventEmitter();
    const room = watchRemoteDataTracks(emitter as unknown as LivekitRoom);
    // As in a join response: announced before any member asks
    emitter.emit(RoomEvent.DataTrackPublished, track("DT_1"));
    emitter.emit(RoomEvent.DataTrackPublished, track("DT_2"));
    emitter.emit(RoomEvent.DataTrackUnpublished, "DT_1");

    const seen: string[][] = [];
    remoteDataTracks$(room).subscribe((tracks) =>
      seen.push(tracks.map((t) => t.info.sid)),
    );
    expect(seen).toEqual([["DT_2"]]);

    emitter.emit(RoomEvent.Disconnected);
    expect(seen.at(-1)).toEqual([]);
  });
});
