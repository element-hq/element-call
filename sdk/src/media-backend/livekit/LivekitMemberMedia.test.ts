/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  ParticipantEvent,
  type RemoteDataTrack,
  type RemoteParticipant,
  RoomEvent,
  type Room as LivekitRoom,
  Track,
  type TrackPublication,
} from "livekit-client";
import { describe, expect, it } from "vitest";

import { E2eeType } from "../../encryption";
import { constant } from "../../reactive/Behavior";
import { testScope } from "../../utils/test";
import { createLivekitMemberMedia } from "./LivekitMemberMedia";

describe("createLivekitMemberMedia", () => {
  it("lists one stable track per publication, in publication order", () => {
    const { participant, publications, room, emitter } = fakes();
    const media = createLivekitMemberMedia(
      testScope(),
      constant({ participants: [participant], room }),
      { kind: E2eeType.NONE },
      logger,
    );
    expect(media.tracks$.value).toEqual([]);

    const microphone = publish(publications, "TR_1", Track.Source.Microphone);
    const camera = publish(publications, "TR_2", Track.Source.Camera);
    emitter.emit(ParticipantEvent.TrackPublished, camera);
    const [first, second] = media.tracks$.value!;
    expect(first.source).toBe("microphone");
    expect(second.source).toBe("camera");

    // An unrelated media event keeps the same objects
    microphone.isMuted = true;
    emitter.emit(ParticipantEvent.TrackMuted, microphone);
    expect(media.tracks$.value![0]).toBe(first);
    expect(media.tracks$.value![1]).toBe(second);

    publications.delete("TR_1");
    emitter.emit(ParticipantEvent.TrackUnpublished, microphone);
    expect(media.tracks$.value).toEqual([second]);
  });

  it("includes a track published without a source", () => {
    const { participant, publications, room, emitter } = fakes();
    const media = createLivekitMemberMedia(
      testScope(),
      constant({ participants: [participant], room }),
      { kind: E2eeType.NONE },
      logger,
    );
    emitter.emit(
      ParticipantEvent.TrackPublished,
      publish(publications, "TR_1", Track.Source.Unknown),
    );
    expect(media.tracks$.value!.map((t) => t.source)).toEqual(["unknown"]);
  });
});

type FakePublication = { isMuted: boolean } & Omit<TrackPublication, "isMuted">;

function publish(
  publications: Map<string, TrackPublication>,
  trackSid: string,
  source: Track.Source,
): FakePublication {
  const publication = Object.assign(new EventEmitter(), {
    trackSid,
    source,
    kind:
      source === Track.Source.Camera || source === Track.Source.ScreenShare
        ? Track.Kind.Video
        : Track.Kind.Audio,
    isMuted: false,
    isEncrypted: true,
    track: undefined,
  }) as unknown as FakePublication;
  publications.set(trackSid, publication as unknown as TrackPublication);
  return publication;
}

describe("a member's data tracks", () => {
  it("follow the room's data track events, after the media", () => {
    const { participant, publications, room, emitter } = fakes();
    const media = createLivekitMemberMedia(
      testScope(),
      constant({ participants: [participant], room }),
      { kind: E2eeType.NONE },
      logger,
    );
    const camera = publish(publications, "TR_1", Track.Source.Camera);
    emitter.emit(ParticipantEvent.TrackPublished, camera);

    const chat = {
      info: { sid: "DT_1", name: "reliable:chat", usesE2ee: true },
      publisherIdentity: participant.identity,
    } as unknown as RemoteDataTrack;
    (room as unknown as EventEmitter).emit(RoomEvent.DataTrackPublished, chat);
    const [video, data] = media.tracks$.value!;
    expect(video.source).toBe("camera");
    expect(data).toMatchObject({
      kind: "data",
      name: "chat",
      reliable: true,
      encrypted: true,
    });

    // An unrelated media event keeps the same object
    emitter.emit(ParticipantEvent.TrackMuted, camera);
    expect(media.tracks$.value![1]).toBe(data);

    (room as unknown as EventEmitter).emit(
      RoomEvent.DataTrackUnpublished,
      "DT_1",
    );
    expect(media.tracks$.value).toEqual([video]);
  });
});

function fakes(): {
  participant: RemoteParticipant;
  publications: Map<string, TrackPublication>;
  room: LivekitRoom;
  emitter: EventEmitter;
} {
  const emitter = new EventEmitter();
  const publications = new Map<string, TrackPublication>();
  const participant = Object.assign(emitter, {
    isLocal: false,
    isSpeaking: false,
    identity: "@alice:example.org:DEVICE",
    trackPublications: publications,
    getTrackPublication: (source: Track.Source) =>
      [...publications.values()].find((p) => p.source === source),
  }) as unknown as RemoteParticipant;
  const room = new EventEmitter() as unknown as LivekitRoom;
  return { participant, publications, room, emitter };
}
