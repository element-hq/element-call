/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import {
  type LocalParticipant,
  ParticipantEvent,
  RemoteAudioTrack,
  type RemoteParticipant,
  type Room as LivekitRoom,
  Track,
  TrackEvent,
  type TrackPublication,
} from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ObservableScope } from "../../reactive/ObservableScope";
import { type AudioMediaTrack } from "../../media-api";
import {
  createLivekitMediaTrack,
  createLocalLivekitMediaTrack,
} from "./LivekitMediaTrack";

describe("createLivekitMediaTrack", () => {
  let scope: ObservableScope;
  beforeEach(() => {
    scope = new ObservableScope();
  });
  afterEach(() => scope.end());

  it("describes the publication", () => {
    const { participant, publication, room } = fakes();
    const track = createLivekitMediaTrack(
      scope,
      participant,
      publication as unknown as TrackPublication,
      room,
    );
    expect(track.kind).toBe("video");
    expect(track.source).toBe("camera");
    expect(track.id).toBe("TR_1");
    expect(track.encrypted$.value).toBe(true);
  });

  it("attaches elements to the track, even one that arrives later", () => {
    const { participant, publication, room, emitter } = fakes({
      track: undefined,
    });
    const element = document.createElement("video");
    const track = createLivekitMediaTrack(
      scope,
      participant,
      publication as unknown as TrackPublication,
      room,
    );
    track.attach(element);
    track.attach(element);

    const livekitTrack = fakeTrack();
    publication.track = livekitTrack;
    emitter.emit(TrackEvent.Subscribed, livekitTrack);
    expect(livekitTrack.attach).toHaveBeenCalledTimes(1);
    expect(livekitTrack.attach).toHaveBeenCalledWith(element);

    track.detach(element);
    expect(livekitTrack.detach).toHaveBeenCalledWith(element);
  });

  it("detaches everything when its scope ends", () => {
    const { participant, publication, room } = fakes();
    const element = document.createElement("video");
    const scope = new ObservableScope();
    const track = createLivekitMediaTrack(
      scope,
      participant,
      publication as unknown as TrackPublication,
      room,
    );
    track.attach(element);
    scope.end();
    expect(publication.track!.detach).toHaveBeenCalledWith(element);
  });

  it("follows the mute state", () => {
    const { participant, publication, room, emitter } = fakes();
    const track = createLivekitMediaTrack(
      scope,
      participant,
      publication as unknown as TrackPublication,
      room,
    );
    expect(track.muted$.value).toBe(false);
    publication.isMuted = true;
    emitter.emit(ParticipantEvent.TrackMuted, publication);
    expect(track.muted$.value).toBe(true);
  });

  it("scales a remote member's volume on the participant", () => {
    const { participant, publication, room } = fakes({
      kind: Track.Kind.Audio,
    });
    const track = createLivekitMediaTrack(
      scope,
      participant,
      publication as unknown as TrackPublication,
      room,
    ) as AudioMediaTrack;
    track.setVolume(0.5);
    expect(publication.track!.setVolume).toHaveBeenCalledWith(0.5);
  });

  it("is active while the member speaks and the track is not muted", () => {
    const { participant, publication, room, emitter } = fakes({
      kind: Track.Kind.Audio,
    });
    const track = createLivekitMediaTrack(
      scope,
      participant,
      publication as unknown as TrackPublication,
      room,
    ) as AudioMediaTrack;
    expect(track.isActive$.value).toBe(false);
    participant.isSpeaking = true;
    emitter.emit(ParticipantEvent.IsSpeakingChanged, true);
    expect(track.isActive$.value).toBe(true);
    publication.isMuted = true;
    emitter.emit(ParticipantEvent.TrackMuted, publication);
    expect(track.isActive$.value).toBe(false);
  });

  it("gives our own track its controls", async () => {
    const { participant, publication, room } = fakes({
      kind: Track.Kind.Audio,
    });
    const setEnabled = vi.fn().mockResolvedValue(false);
    const switchActiveDevice = vi.fn().mockResolvedValue(true);
    const track = createLocalLivekitMediaTrack(
      scope,
      Object.assign(participant, {
        isLocal: true,
      }) as unknown as LocalParticipant,
      publication as unknown as TrackPublication,
      Object.assign(room, { switchActiveDevice }),
      setEnabled,
    );
    await expect(track.setEnabled(false)).resolves.toBe(false);
    expect(setEnabled).toHaveBeenCalledWith("microphone", false);
    await track.setDevice("mic-2");
    expect(switchActiveDevice).toHaveBeenCalledWith("audioinput", "mic-2");
  });
});

type FakeTrack = Track & {
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
};

type FakePublication = Omit<TrackPublication, "track" | "isMuted"> & {
  track: FakeTrack | undefined;
  isMuted: boolean;
};

function fakeTrack(): FakeTrack {
  return Object.assign(Object.create(RemoteAudioTrack.prototype), {
    attach: vi.fn(),
    detach: vi.fn(),
    setVolume: vi.fn(),
    setAudioContext: vi.fn(),
    setWebAudioPlugins: vi.fn(),
  }) as FakeTrack;
}

function fakes({
  track = fakeTrack(),
  kind = Track.Kind.Video,
}: { track?: FakeTrack | undefined; kind?: Track.Kind } = {}): {
  participant: RemoteParticipant & { isSpeaking: boolean };
  publication: FakePublication;
  room: LivekitRoom;
  emitter: EventEmitter;
} {
  const emitter = new EventEmitter();
  const participant = Object.assign(emitter, {
    isLocal: false,
    isSpeaking: false,
    identity: "@alice:example.org:DEVICE",
    getTrackPublication: (): TrackPublication =>
      publication as unknown as TrackPublication,
  }) as unknown as RemoteParticipant & { isSpeaking: boolean };
  const publication = Object.assign(emitter, {
    kind,
    source:
      kind === Track.Kind.Audio ? Track.Source.Microphone : Track.Source.Camera,
    trackSid: "TR_1",
    isMuted: false,
    isEncrypted: true,
    track,
  }) as unknown as FakePublication;
  const room = new EventEmitter() as unknown as LivekitRoom;
  return { participant, publication, room, emitter };
}
