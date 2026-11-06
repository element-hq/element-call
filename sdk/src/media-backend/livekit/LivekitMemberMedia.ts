/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  observeParticipantMedia,
  roomEventSelector,
} from "@livekit/components-core";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  type LocalParticipant,
  type Participant,
  type Room as LivekitRoom,
  RoomEvent,
  type TrackPublication,
} from "livekit-client";
import {
  EMPTY,
  filter,
  map,
  type Observable,
  of,
  switchMap,
  combineLatest,
} from "rxjs";

import { type ObservableScope } from "../../reactive/ObservableScope";
import { generateItems } from "../../reactive/observable";
import { E2eeType, type EncryptionSystem } from "../../encryption";
import { type Behavior } from "../../reactive/Behavior";
import {
  type DataTrack,
  type EncryptionError,
  type LocalMemberMedia,
  type MediaSource,
  type MemberMedia,
} from "../../media-api";
import { createLivekitDataTrack } from "./LivekitDataTrack";
import { remoteDataTracks$ } from "./RemoteDataTracks";
import {
  createLivekitMediaTrack,
  createLocalLivekitMediaTrack,
} from "./LivekitMediaTrack";
import { shallowEquals as arrayShallowEquals } from "../../utils/array";

/** Where a member's media comes from: its participant on a room, null while it has none. */
export type ParticipantSource<P extends Participant = Participant> = {
  participants: P[];
  room: LivekitRoom;
} | null;

export function participantSourcesEqual<P extends Participant = Participant>(
  a: ParticipantSource<P>,
  b: ParticipantSource<P>,
): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      arrayShallowEquals(a.participants, b.participants) &&
      a.room === b.room)
  );
}

/**
 * A member's media from its participant. The only place, with
 * `LivekitMediaTrack`, that reads a LiveKit participant; everything above
 * sees tracks and behaviors.
 */
export function createLivekitMemberMedia(
  scope: ObservableScope,
  source$: Behavior<ParticipantSource>,
  encryptionSystem: EncryptionSystem,
  logger: Logger,
): MemberMedia {
  const media$ = memberTracks$(
    scope,
    source$,
    (trackScope, participant, publication, room) =>
      createLivekitMediaTrack(trackScope, participant, publication, room),
  );
  const data$ = memberDataTracks$(scope, source$, logger);
  return {
    // The data tracks after the media, both null while there is no participant
    tracks$: scope.behavior(
      combineLatest([media$, data$], (media, data) =>
        media === null ? null : [...media, ...data],
      ),
    ),
    encryptionError$: encryptionErrors$(source$, encryptionSystem),
  };
}

export function createLocalLivekitMemberMedia(
  scope: ObservableScope,
  source$: Behavior<ParticipantSource<LocalParticipant>>,
  encryptionSystem: EncryptionSystem,
  setEnabled: (source: MediaSource, enabled: boolean) => Promise<boolean>,
): LocalMemberMedia {
  return {
    tracks$: memberTracks$(
      scope,
      source$,
      (trackScope, participant, publication, room) =>
        createLocalLivekitMediaTrack(
          trackScope,
          participant,
          publication,
          room,
          setEnabled,
        ),
    ),
    encryptionError$: encryptionErrors$(source$, encryptionSystem),
  };
}

/**
 * One track per publication, each living as long as its publication is in
 * the participant's map; null while there is no participant.
 */
function memberTracks$<P extends Participant, T>(
  scope: ObservableScope,
  source$: Behavior<ParticipantSource<P>>,
  factory: (
    scope: ObservableScope,
    participant: P,
    publication: TrackPublication,
    room: LivekitRoom,
  ) => T,
): Behavior<T[] | null> {
  return scope.behavior(
    source$.pipe(
      switchMap((source) => {
        if (source === null) return of(null);
        const { participants, room } = source;
        return combineLatest(
          participants.map((participant) =>
            observeParticipantMedia(participant).pipe(
              generateItems(
                `${participant.identity} tracks$`,
                function* () {
                  for (const publication of participant.trackPublications.values())
                    yield { keys: [publication.trackSid], data: publication };
                },
                (trackScope, publication$) =>
                  factory(trackScope, participant, publication$.value, room),
              ),
            ),
          ),
          (...tracks) => tracks.flat(1),
        );
      }),
    ),
  );
}

/**
 * One data track per LiveKit data track of the member's participants, each
 * living as long as it is published.
 */
function memberDataTracks$(
  scope: ObservableScope,
  source$: Behavior<ParticipantSource>,
  logger: Logger,
): Behavior<DataTrack[]> {
  return scope.behavior(
    source$.pipe(
      switchMap((source) => {
        if (source === null) return of([]);
        const { participants, room } = source;
        const identities = new Set(participants.map((p) => p.identity));
        return remoteDataTracks$(room).pipe(
          map((tracks) =>
            tracks.filter((t) => identities.has(t.publisherIdentity)),
          ),
          generateItems(
            `${[...identities].join(",")} dataTracks$`,
            function* (tracks) {
              for (const track of tracks)
                yield { keys: [track.info.sid], data: track };
            },
            (_trackScope, track$) =>
              createLivekitDataTrack(room, track$.value, logger),
          ),
        );
      }),
    ),
  );
}

function encryptionErrors$(
  source$: Behavior<ParticipantSource>,
  encryptionSystem: EncryptionSystem,
): Observable<EncryptionError> {
  return source$.pipe(
    switchMap((source) =>
      source === null
        ? EMPTY
        : roomEventSelector(source.room, RoomEvent.EncryptionError).pipe(
            map(([error]) => error?.message ?? ""),
            // The participant the error is about does not survive the trip
            // from the worker, so the identity is matched in the message. A
            // shared key is the same for everyone, so its errors are too.
            filter(
              (message) =>
                encryptionSystem.kind === E2eeType.SHARED_KEY ||
                source.participants.some((p) => message.includes(p.identity)),
            ),
            map((message): EncryptionError | undefined =>
              message.includes("MissingKey")
                ? "MissingKey"
                : message.includes("InvalidKey")
                  ? "InvalidKey"
                  : undefined,
            ),
            filter((error) => error !== undefined),
          ),
    ),
  );
}
