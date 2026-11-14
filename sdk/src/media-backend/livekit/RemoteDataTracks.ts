/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type RemoteDataTrack,
  type Room as LivekitRoom,
  RoomEvent,
} from "livekit-client";
import { BehaviorSubject, type Observable } from "rxjs";

const tracksByRoom = new WeakMap<
  LivekitRoom,
  BehaviorSubject<readonly RemoteDataTrack[]>
>();

/**
 * Starts keeping the room's remote data tracks, from its own events. Called
 * as the room is created: LiveKit announces the tracks in the join response
 * before the participants that publish them exist, so a participant's
 * `dataTracks` misses them, and it adds a track to that map only after
 * announcing it.
 */
export function watchRemoteDataTracks(room: LivekitRoom): LivekitRoom {
  remoteDataTracksOf(room);
  return room;
}

/** Every remote data track the room knows of, as LiveKit announced them. */
export function remoteDataTracks$(
  room: LivekitRoom,
): Observable<readonly RemoteDataTrack[]> {
  return remoteDataTracksOf(room);
}

function remoteDataTracksOf(
  room: LivekitRoom,
): BehaviorSubject<readonly RemoteDataTrack[]> {
  let tracks$ = tracksByRoom.get(room);
  if (tracks$ === undefined) {
    const subject$ = new BehaviorSubject<readonly RemoteDataTrack[]>([]);
    room.on(RoomEvent.DataTrackPublished, (track: RemoteDataTrack) =>
      subject$.next([
        ...subject$.value.filter((t) => t.info.sid !== track.info.sid),
        track,
      ]),
    );
    room.on(RoomEvent.DataTrackUnpublished, (sid: string) =>
      subject$.next(subject$.value.filter((t) => t.info.sid !== sid)),
    );
    // A new session announces its tracks again
    room.on(RoomEvent.Disconnected, () => subject$.next([]));
    tracksByRoom.set(room, subject$);
    tracks$ = subject$;
  }
  return tracks$;
}
