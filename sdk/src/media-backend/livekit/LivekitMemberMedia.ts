/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  observeParticipantMedia,
  roomEventSelector,
} from "@livekit/components-core";
import {
  type LocalParticipant,
  type Participant,
  type Room as LivekitRoom,
  RoomEvent,
  type TrackPublication,
} from "livekit-client";
import { EMPTY, filter, map, type Observable, of, switchMap } from "rxjs";

import { type ObservableScope } from "../../reactive/ObservableScope";
import { generateItems } from "../../reactive/observable";
import { E2eeType, type EncryptionSystem } from "../../encryption";
import { type Behavior } from "../../reactive/Behavior";
import { mapScoped } from "../../utils/mapScoped";
import {
  type EncryptionError,
  type LocalMemberMedia,
  type MediaSource,
  type MemberMedia,
} from "../../media-api";
import {
  createLivekitMediaTrack,
  createLocalLivekitMediaTrack,
} from "./LivekitMediaTrack";

/** Where a member's media comes from: its participant on a room, null while it has none. */
export type ParticipantSource<P extends Participant = Participant> = {
  participant: P;
  room: LivekitRoom;
} | null;

/**
 * A member's media from its participant. The only place, with
 * `LivekitMediaTrack`, that reads a LiveKit participant; everything above
 * sees tracks and behaviors.
 */
export function createLivekitMemberMedia(
  scope: ObservableScope,
  source$: Behavior<ParticipantSource>,
  encryptionSystem: EncryptionSystem,
): MemberMedia {
  return {
    tracks$: memberTracks$(
      scope,
      source$,
      (trackScope, participant, publication, room) =>
        createLivekitMediaTrack(trackScope, participant, publication, room),
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
    mapScoped(scope, source$, (participantScope, { participant, room }) =>
      participantScope.behavior(
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
    ).pipe(switchMap((tracks$) => tracks$ ?? of(null))),
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
                message.includes(source.participant.identity),
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
