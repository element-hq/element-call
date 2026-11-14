/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionState as LivekitConnectionState,
  type LocalDataTrack as LivekitLocalDataTrack,
  type LocalParticipant,
  type LocalTrack,
  type LocalTrackPublication,
  ParticipantEvent,
  type Room as LivekitRoom,
  Track,
} from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { E2eeType } from "../../encryption";
import { FailToStartLivekitConnection, MatrixRTCError } from "../../errors";
import { Epoch, type ObservableScope } from "../../reactive/ObservableScope";
import { flushPromises, mockEmitter, testScope } from "../../utils/test";
import { MediaConnectionState } from "../api";
import { type TransportLocator } from "./auth";
import { type Connection, type ConnectionState } from "./Connection";
import { ConnectionMap } from "./ConnectionMap";
import { createLivekitLocalMedia } from "./LocalMedia";
import { exampleTransport } from "./test";
import {
  type LocalAudioMediaTrack,
  type LocalDataTrack,
} from "../../media-api";

const localTransport: TransportLocator = {
  transport: exampleTransport,
  serverName: "example.org",
};
const connected: ConnectionState = {
  state: "authenticated",
  livekitState: LivekitConnectionState.Connected,
};

interface FakeConnection {
  connection: Connection;
  participant: LocalParticipant;
  room: LivekitRoom;
  state$: BehaviorSubject<ConnectionState>;
}

/** A connection to the local transport with a participant that publishes on demand. */
function fakeConnection(state: ConnectionState = connected): FakeConnection {
  const participant = fakeLocalParticipant();
  const room = {
    options: {},
    setE2EEEnabled: vi.fn(),
    localParticipant: participant,
    remoteParticipants: new Map(),
    getActiveDevice: vi.fn(),
    switchActiveDevice: vi.fn(async () => Promise.resolve(true)),
    ...mockEmitter(),
  } as unknown as LivekitRoom;
  const state$ = new BehaviorSubject<ConnectionState>(state);
  const connection = {
    role: "publisher",
    transport: exampleTransport,
    serverName: "example.org",
    state$,
    livekitRoom: room,
  } as unknown as Connection;
  return { connection, participant, room, state$ };
}

function mapOf(...connections: Connection[]): Epoch<ConnectionMap> {
  const map = new ConnectionMap();
  for (const connection of connections) map.add(connection, []);
  return new Epoch(map);
}

function setup(
  scope: ObservableScope = testScope(),
  publish = [{ source: "microphone" as const }],
): {
  media: ReturnType<typeof createLivekitLocalMedia>;
  connectionMap$: BehaviorSubject<Epoch<ConnectionMap>>;
  localTransport$: BehaviorSubject<TransportLocator | null>;
  audioOutputDeviceId$: BehaviorSubject<string | undefined>;
} {
  const connectionMap$ = new BehaviorSubject(mapOf());
  const localTransport$ = new BehaviorSubject<TransportLocator | null>(null);
  const audioOutputDeviceId$ = new BehaviorSubject<string | undefined>(
    undefined,
  );
  const media = createLivekitLocalMedia({
    scope,
    connectionMap$: scope.behavior(connectionMap$),
    localTransport$: scope.behavior(localTransport$),
    publish,
    audioOutputDeviceId$,
    encryptionSystem: { kind: E2eeType.NONE },
    logger,
  });
  return { media, connectionMap$, localTransport$, audioOutputDeviceId$ };
}

describe("createLivekitLocalMedia", () => {
  it("finds the connection to the local transport once both are known", () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const { connection } = fakeConnection();
    expect(media.connection$.value).toBeNull();
    expect(media.connectionState$.value).toBe(MediaConnectionState.Initialized);

    connectionMap$.next(mapOf(connection));
    expect(media.connection$.value).toBeNull();

    localTransport$.next(localTransport);
    expect(media.connection$.value).toBe(connection);
    expect(media.connectionState$.value).toBe(MediaConnectionState.Connected);
  });

  it("follows the connection's state", () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const { connection, state$ } = fakeConnection({ state: "authenticating" });
    connectionMap$.next(mapOf(connection));
    localTransport$.next(localTransport);
    expect(media.connectionState$.value).toBe(MediaConnectionState.Preparing);

    const error = new MatrixRTCError("no token");
    state$.next({ state: "error", error });
    expect(media.connectionState$.value).toBe(error);
  });

  it("creates the tracks on the first publish and holds them back until then", async () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const { connection, participant } = fakeConnection();
    connectionMap$.next(mapOf(connection));
    localTransport$.next(localTransport);
    await flushPromises();
    expect(participant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(media.tracks$.value).toEqual([]);

    media.setPublishing(true);
    await flushPromises();

    expect(participant.setMicrophoneEnabled).toHaveBeenCalledOnce();
    expect(media.tracks$.value).toHaveLength(1);
    expect(media.tracks$.value![0].source).toBe("microphone");
    expect(track(participant, Track.Source.Microphone).isUpstreamPaused).toBe(
      false,
    );
  });

  it("pauses the upstream while the member is not publishing", async () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const { connection, participant } = fakeConnection();
    connectionMap$.next(mapOf(connection));
    localTransport$.next(localTransport);
    media.setPublishing(true);
    await flushPromises();

    media.setPublishing(false);
    await flushPromises();
    expect(track(participant, Track.Source.Microphone).isUpstreamPaused).toBe(
      true,
    );

    media.setPublishing(true);
    await flushPromises();
    expect(track(participant, Track.Source.Microphone).isUpstreamPaused).toBe(
      false,
    );
  });

  it("resolves a publish made before the connection exists once it is up", async () => {
    const { media, connectionMap$, localTransport$ } = setup();
    let published: string | undefined;
    const publishing = media
      .publish({ source: "camera" })
      .then((t) => (published = t.source));
    await flushPromises();
    expect(published).toBeUndefined();

    const { connection, participant } = fakeConnection();
    connectionMap$.next(mapOf(connection));
    localTransport$.next(localTransport);
    media.setPublishing(true);
    await publishing;

    expect(published).toBe("camera");
    // Both were requested before the start, so one prompt covers both
    expect(participant.enableCameraAndMicrophone).toHaveBeenCalledOnce();
    expect(media.tracks$.value?.map((t) => t.source)).toEqual([
      "microphone",
      "camera",
    ]);
  });

  it("publishes a request at once on a started publisher", async () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const { connection, participant } = fakeConnection();
    connectionMap$.next(mapOf(connection));
    localTransport$.next(localTransport);
    media.setPublishing(true);
    await flushPromises();

    const t = await media.publish({ source: "screenShare" });

    expect(t.source).toBe("screenShare");
    expect(participant.setScreenShareEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ selfBrowserSurface: "include" }),
      undefined,
    );
  });

  it("rejects a publish the device refuses, and forgets the request", async () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const { connection, participant } = fakeConnection();
    connectionMap$.next(mapOf(connection));
    localTransport$.next(localTransport);
    media.setPublishing(true);
    await flushPromises();
    vi.mocked(participant.setCameraEnabled).mockRejectedValueOnce(
      new Error("NotAllowedError"),
    );

    const rejection = media.publish({ source: "camera" });
    await expect(rejection).rejects.toBeInstanceOf(MatrixRTCError);
    await expect(rejection).rejects.toThrow("NotAllowedError");

    // A new connection does not try the camera again
    const next = fakeConnection();
    connectionMap$.next(mapOf(next.connection));
    await flushPromises();
    expect(next.participant.setCameraEnabled).not.toHaveBeenCalled();
    expect(next.participant.setMicrophoneEnabled).toHaveBeenCalled();
  });

  it("publishes again on a new connection and stops the old tracks", async () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const first = fakeConnection();
    connectionMap$.next(mapOf(first.connection));
    localTransport$.next(localTransport);
    media.setPublishing(true);
    await flushPromises();
    await media.publish({ source: "camera" });
    const firstTracks = [
      track(first.participant, Track.Source.Microphone),
      track(first.participant, Track.Source.Camera),
    ];

    const second = fakeConnection();
    connectionMap$.next(mapOf(second.connection));
    await flushPromises();

    for (const t of firstTracks)
      expect(first.participant.unpublishTrack).toHaveBeenCalledWith(t, true);
    expect(second.participant.enableCameraAndMicrophone).toHaveBeenCalledOnce();
    expect(media.tracks$.value?.map((t) => t.source)).toEqual([
      "microphone",
      "camera",
    ]);
    expect(
      track(second.participant, Track.Source.Camera).isUpstreamPaused,
    ).toBe(false);
  });

  it("remembers a mute across connections", async () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const first = fakeConnection();
    connectionMap$.next(mapOf(first.connection));
    localTransport$.next(localTransport);
    media.setPublishing(true);
    await flushPromises();

    const microphone = media.tracks$.value![0] as LocalAudioMediaTrack;
    await expect(microphone.setEnabled(false)).resolves.toBe(false);
    expect(first.participant.setMicrophoneEnabled).toHaveBeenLastCalledWith(
      false,
    );

    const second = fakeConnection();
    connectionMap$.next(mapOf(second.connection));
    await flushPromises();
    // Muted means not created at all, to spare the permission prompt
    expect(second.participant.setMicrophoneEnabled).not.toHaveBeenCalled();
  });

  it("unpublishes a source, the screen share audio with its video", async () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const { connection, participant } = fakeConnection();
    connectionMap$.next(mapOf(connection));
    localTransport$.next(localTransport);
    media.setPublishing(true);
    await flushPromises();
    await media.publish({ source: "screenShare" });

    await media.unpublish({
      kind: "audio",
      source: "screenShareAudio",
    } as LocalAudioMediaTrack);
    expect(participant.setScreenShareEnabled).toHaveBeenLastCalledWith(false);

    await media.unpublish({
      kind: "audio",
      source: "microphone",
    } as LocalAudioMediaTrack);
    expect(participant.unpublishTrack).toHaveBeenCalledOnce();
    expect(media.tracks$.value).toEqual([]);
  });

  it("keeps the first failure to publish", async () => {
    const { media, connectionMap$, localTransport$ } = setup();
    const { connection, participant } = fakeConnection();
    connectionMap$.next(mapOf(connection));
    localTransport$.next(localTransport);
    media.setPublishing(true);
    await flushPromises();
    expect(media.publishError$.value).toBeNull();

    const microphone = track(participant, Track.Source.Microphone);
    vi.mocked(microphone.resumeUpstream).mockRejectedValue(
      new Error("no upstream"),
    );
    media.setPublishing(false);
    await flushPromises();
    media.setPublishing(true);
    await flushPromises();

    expect(media.publishError$.value).toBeInstanceOf(
      FailToStartLivekitConnection,
    );
    expect(media.publishError$.value?.message).toContain("no upstream");
  });

  it("plays on the device given, on the current room and the rooms to come", async () => {
    const { media, connectionMap$, localTransport$, audioOutputDeviceId$ } =
      setup();
    await media.setAudioOutputDeviceId("speaker");
    expect(audioOutputDeviceId$.value).toBe("speaker");

    const { connection, room } = fakeConnection();
    connectionMap$.next(mapOf(connection));
    localTransport$.next(localTransport);
    await flushPromises();
    await media.setAudioOutputDeviceId("headset");

    expect(room.switchActiveDevice).toHaveBeenCalledWith(
      "audiooutput",
      "headset",
    );
  });
});

function track(
  participant: LocalParticipant,
  source: Track.Source,
): LocalTrack {
  const t = participant.getTrackPublication(source)?.track;
  if (t === undefined) throw new Error(`No ${source} track`);
  return t;
}

function fakeLocalTrack(source: Track.Source): LocalTrack {
  const state = { isMuted: false, isUpstreamPaused: false };
  const t = {
    source,
    get isMuted() {
      return state.isMuted;
    },
    get isUpstreamPaused() {
      return state.isUpstreamPaused;
    },
    attach: vi.fn(),
    detach: vi.fn(),
    mute: vi.fn(async () => {
      state.isMuted = true;
      return Promise.resolve(t);
    }),
    unmute: vi.fn(async () => {
      state.isMuted = false;
      return Promise.resolve(t);
    }),
    pauseUpstream: vi.fn(async () => {
      state.isUpstreamPaused = true;
      return Promise.resolve();
    }),
    resumeUpstream: vi.fn(async () => {
      state.isUpstreamPaused = false;
      return Promise.resolve();
    }),
  };
  return t as unknown as LocalTrack;
}

describe("local data tracks", () => {
  function joined(): ReturnType<typeof setup> & FakeConnection {
    const fixture = setup();
    const fake = fakeConnection();
    fixture.connectionMap$.next(mapOf(fake.connection));
    fixture.localTransport$.next(localTransport);
    return { ...fixture, ...fake };
  }

  it("publishes on LiveKit only once publishing is allowed, and again on a new connection", async () => {
    const { media, participant, connectionMap$ } = joined();
    let published = false;
    const publishing = media
      .publish({ source: "data", name: "chat" })
      .then((track) => {
        published = true;
        return track;
      });
    await flushPromises();
    expect(participant.publishDataTrack).not.toHaveBeenCalled();
    expect(published).toBe(false);
    // Listed from the request on, like a media publication
    const listed = media.tracks$.value!.find((t) => t.kind === "data");
    expect(listed).toMatchObject({ name: "chat", reliable: true });

    media.setPublishing(true);
    const chat = await publishing;
    expect(chat).toBe(listed);
    expect(participant.publishDataTrack).toHaveBeenCalledWith({
      name: "reliable:chat",
    });

    const next = fakeConnection();
    connectionMap$.next(mapOf(next.connection));
    await flushPromises();
    expect(next.participant.publishDataTrack).toHaveBeenCalledWith({
      name: "reliable:chat",
    });
    // The host's object outlives the connection
    expect(media.tracks$.value).toContain(chat);
  });

  it("sends reliable data as a byte stream and lossy data as frames, replaying what was sent", async () => {
    const { media, participant } = joined();
    media.setPublishing(true);
    const chat = await media.publish({ source: "data", name: "chat" });
    const cursors = await media.publish({
      source: "data",
      name: "cursors",
      reliable: false,
    });
    await flushPromises();
    const sent: Uint8Array[] = [];
    chat.data$.subscribe((p) => sent.push(p));

    await chat.send(new Uint8Array([1]));
    expect(participant.sendBytes).toHaveBeenCalledWith(new Uint8Array([1]), {
      topic: "reliable:chat",
    });
    expect(sent).toEqual([new Uint8Array([1])]);

    await cursors.send(new Uint8Array([2]));
    const livekitCursors = await vi.mocked(participant.publishDataTrack).mock
      .results[1].value;
    expect(livekitCursors.tryPush).toHaveBeenCalledWith({
      payload: new Uint8Array([2]),
    });
  });

  it("rejects a second track of the same name, or one LiveKit refuses", async () => {
    const { media, participant } = joined();
    media.setPublishing(true);
    await media.publish({ source: "data", name: "chat" });
    await expect(
      media.publish({ source: "data", name: "chat", reliable: false }),
    ).rejects.toThrow("published already");

    vi.mocked(participant.publishDataTrack).mockRejectedValueOnce(
      new Error("DuplicateName"),
    );
    await expect(
      media.publish({ source: "data", name: "cursors" }),
    ).rejects.toThrow("DuplicateName");
    expect(
      media.tracks$.value!.filter((t) => t.kind === "data").map((t) => t.name),
    ).toEqual(["chat"]);
  });

  it("finishes a track on unpublish", async () => {
    const { media, participant } = joined();
    media.setPublishing(true);
    const chat: LocalDataTrack = await media.publish({
      source: "data",
      name: "chat",
    });
    await flushPromises();
    let completed = false;
    chat.data$.subscribe({ complete: () => (completed = true) });

    await media.unpublish(chat);
    await flushPromises();
    const livekitChat = await vi.mocked(participant.publishDataTrack).mock
      .results[0].value;
    expect(livekitChat.unpublish).toHaveBeenCalled();
    expect(completed).toBe(true);
    expect(media.tracks$.value).not.toContain(chat);
    await expect(chat.send(new Uint8Array([1]))).rejects.toThrow("unpublished");
  });
});

/**
 * The slice of a local participant the publisher and the local tracks use:
 * enabling a source publishes a fake track at once, muting an existing one
 * mutes it, and the publications map and events are kept as LiveKit would.
 */
function fakeLocalParticipant(): LocalParticipant {
  const emitter = mockEmitter<LocalParticipant>();
  const trackPublications = new Map<string, LocalTrackPublication>();
  let nextSid = 0;

  const getTrackPublication = (
    source: Track.Source,
  ): LocalTrackPublication | undefined =>
    [...trackPublications.values()].find((p) => p.source === source);

  const publish = (source: Track.Source): LocalTrackPublication => {
    const t = fakeLocalTrack(source);
    const publication = {
      track: t,
      source,
      kind:
        source === Track.Source.Microphone
          ? Track.Kind.Audio
          : Track.Kind.Video,
      trackSid: `TR_${nextSid++}`,
      isEncrypted: false,
      isSubscribed: true,
      get isMuted() {
        return t.isMuted;
      },
      mute: t.mute,
      unmute: t.unmute,
      ...mockEmitter(),
    } as unknown as LocalTrackPublication;
    trackPublications.set(publication.trackSid, publication);
    emitter.emit(ParticipantEvent.LocalTrackPublished, publication);
    return publication;
  };
  const unpublish = (publication: LocalTrackPublication): void => {
    trackPublications.delete(publication.trackSid);
    emitter.emit(ParticipantEvent.LocalTrackUnpublished, publication);
  };
  const setEnabled = async (
    source: Track.Source,
    enabled: boolean,
  ): Promise<LocalTrackPublication | undefined> => {
    const existing = getTrackPublication(source);
    if (enabled) {
      if (existing) await existing.unmute();
      return existing ?? publish(source);
    }
    await existing?.mute();
    return existing;
  };

  const participant = {
    ...emitter,
    publishDataTrack: vi.fn(async ({ name }: { name: string }) =>
      Promise.resolve({
        name,
        tryPush: vi.fn(async () => Promise.resolve()),
        unpublish: vi.fn(async () => Promise.resolve()),
      } as unknown as LivekitLocalDataTrack),
    ),
    sendBytes: vi.fn(async () => Promise.resolve({})),
    identity: "@alice:example.org:DEVICE",
    isLocal: true,
    isSpeaking: false,
    audioLevel: 0,
    trackPublications,
    getTrackPublication,
    setMicrophoneEnabled: vi.fn(async (enabled: boolean) =>
      setEnabled(Track.Source.Microphone, enabled),
    ),
    setCameraEnabled: vi.fn(async (enabled: boolean) =>
      setEnabled(Track.Source.Camera, enabled),
    ),
    setScreenShareEnabled: vi.fn(async (enabled: boolean) => {
      if (enabled) return setEnabled(Track.Source.ScreenShare, true);
      const existing = getTrackPublication(Track.Source.ScreenShare);
      if (existing) unpublish(existing);
      return Promise.resolve(existing);
    }),
    enableCameraAndMicrophone: vi.fn(async () => {
      publish(Track.Source.Microphone);
      publish(Track.Source.Camera);
      return Promise.resolve();
    }),
    unpublishTrack: vi.fn(async (t: LocalTrack) => {
      const publication = [...trackPublications.values()].find(
        (p) => p.track === t,
      );
      if (publication !== undefined) unpublish(publication);
      return Promise.resolve(publication);
    }),
  };
  return participant as unknown as LocalParticipant;
}
