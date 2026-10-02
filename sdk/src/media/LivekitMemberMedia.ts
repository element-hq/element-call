/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  observeParticipantEvents,
  observeParticipantMedia,
  roomEventSelector,
} from "@livekit/components-core";
import {
  facingModeFromLocalTrack,
  type LocalParticipant,
  LocalVideoTrack,
  type Participant,
  ParticipantEvent,
  type Room as LivekitRoom,
  RoomEvent,
  Track,
  type TrackPublication,
} from "livekit-client";
import { distinctUntilChanged, filter, map, type Observable } from "rxjs";

import { type Behavior } from "../reactive/Behavior";
import { type ObservableScope } from "../reactive/ObservableScope";
import { E2eeType } from "../encryption";
import { type EncryptionSystem } from "../encryption";
import {
  type AudioMediaTrack,
  type EncryptionError,
  type LocalMemberMedia,
  type MediaSource,
  type MemberMedia,
  type VideoMediaTrack,
} from "../api";
import { mapScoped } from "../utils/mapScoped";
import { createLivekitMediaTrack, livekitSources } from "./LivekitMediaTrack";

/**
 * A participant as `MemberMedia`. The only place, with `LivekitMediaTrack`,
 * that reads a LiveKit participant; everything above sees tracks and
 * behaviors.
 */
export function createLivekitMemberMedia(
  scope: ObservableScope,
  participant: Participant,
  room: LivekitRoom,
  encryptionSystem: EncryptionSystem,
): MemberMedia {
  const mediaChanged$ = observeParticipantMedia(participant);
  const track$ = <T extends AudioMediaTrack | VideoMediaTrack>(
    source: MediaSource,
  ): Behavior<T | undefined> =>
    memberTrack$(scope, participant, room, source, mediaChanged$) as Behavior<
      T | undefined
    >;

  return {
    local: participant.isLocal,
    speaking$: scope.behavior(
      observeParticipantEvents(
        participant,
        ParticipantEvent.IsSpeakingChanged,
      ).pipe(map((p) => p.isSpeaking)),
      participant.isSpeaking,
    ),
    screenShareEnabled$: scope.behavior(
      mediaChanged$.pipe(map((media) => media.isScreenShareEnabled)),
      participant.isScreenShareEnabled,
    ),
    microphone$: track$<AudioMediaTrack>("microphone"),
    camera$: track$<VideoMediaTrack>("camera"),
    screenShare$: track$<VideoMediaTrack>("screenShare"),
    screenShareAudio$: track$<AudioMediaTrack>("screenShareAudio"),
    encryptionError$: encryptionErrors$(
      scope,
      participant,
      room,
      encryptionSystem,
    ),
  };
}

export function createLocalLivekitMemberMedia(
  scope: ObservableScope,
  participant: LocalParticipant,
  room: LivekitRoom,
  encryptionSystem: EncryptionSystem,
): LocalMemberMedia {
  return {
    ...createLivekitMemberMedia(scope, participant, room, encryptionSystem),
    local: true,
    switchCamera: async () => {
      const track = participant.getTrackPublication(Track.Source.Camera)?.track;
      if (!(track instanceof LocalVideoTrack)) return;
      const { facingMode } = facingModeFromLocalTrack(track);
      if (facingMode !== "user" && facingMode !== "environment") return;
      await track.restartTrack({
        facingMode: facingMode === "user" ? "environment" : "user",
      });
      return track.mediaStreamTrack.getSettings().deviceId;
    },
  };
}

/** The member's track for a source, as long as the same publication is behind it. */
function memberTrack$(
  scope: ObservableScope,
  participant: Participant,
  room: LivekitRoom,
  source: MediaSource,
  mediaChanged$: Observable<unknown>,
): Behavior<AudioMediaTrack | VideoMediaTrack | undefined> {
  const publication = (): TrackPublication | undefined =>
    participant.getTrackPublication(livekitSources[source]);
  return mapScoped(
    scope,
    scope.behavior(
      mediaChanged$.pipe(map(publication), distinctUntilChanged()),
      publication(),
    ),
    (trackScope, publication) =>
      createLivekitMediaTrack(
        trackScope,
        participant,
        publication,
        room,
        source,
      ),
  );
}

function encryptionErrors$(
  scope: ObservableScope,
  participant: Participant,
  room: LivekitRoom,
  encryptionSystem: EncryptionSystem,
): Observable<EncryptionError> {
  return roomEventSelector(room, RoomEvent.EncryptionError).pipe(
    map(([error]) => error?.message ?? ""),
    // The participant the error is about does not survive the trip from the
    // worker, so the identity is matched in the message. A shared key is the
    // same for everyone, so its errors are too.
    filter(
      (message) =>
        encryptionSystem.kind === E2eeType.SHARED_KEY ||
        message.includes(participant.identity),
    ),
    map((message): EncryptionError | undefined =>
      message.includes("MissingKey")
        ? "MissingKey"
        : message.includes("InvalidKey")
          ? "InvalidKey"
          : undefined,
    ),
    filter((error) => error !== undefined),
    scope.bind(),
  );
}
