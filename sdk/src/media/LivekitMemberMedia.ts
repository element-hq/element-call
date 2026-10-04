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
  facingModeFromLocalTrack,
  type LocalParticipant,
  LocalVideoTrack,
  type Participant,
  type Room as LivekitRoom,
  RoomEvent,
  Track,
} from "livekit-client";
import { filter, map, type Observable } from "rxjs";

import { type ObservableScope } from "../reactive/ObservableScope";
import { generateItems } from "../reactive/observable";
import { E2eeType } from "../encryption";
import { type EncryptionSystem } from "../encryption";
import {
  type EncryptionError,
  type LocalMemberMedia,
  type MemberMedia,
} from "../api";
import { createLivekitMediaTrack } from "./LivekitMediaTrack";

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
  return {
    local: participant.isLocal,
    // One track per publication, each living as long as its publication is
    // in the participant's map
    tracks$: scope.behavior(
      observeParticipantMedia(participant).pipe(
        generateItems(
          `${participant.identity} tracks$`,
          function* () {
            for (const publication of participant.trackPublications.values())
              yield { keys: [publication.trackSid], data: publication };
          },
          (trackScope, publication$) =>
            createLivekitMediaTrack(
              trackScope,
              participant,
              publication$.value,
              room,
            ),
        ),
      ),
    ),
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
