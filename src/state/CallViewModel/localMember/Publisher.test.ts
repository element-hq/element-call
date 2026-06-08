/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import {
  ConnectionState as LivekitConnectionState,
  LocalParticipant,
  type LocalTrack,
  type LocalTrackPublication,
  ParticipantEvent,
  Track,
} from "livekit-client";
import { BehaviorSubject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { ObservableScope } from "../../ObservableScope";
import { constant } from "../../Behavior";
import {
  flushPromises,
  mockLivekitRoom,
  mockMediaDevices,
} from "../../../utils/test";
import { Publisher } from "./Publisher";
import { type Connection } from "../remoteMembers/Connection";
import { type MuteStates } from "../../MuteStates";

let scope: ObservableScope;

beforeEach(() => {
  scope = new ObservableScope();
});

afterEach(() => scope.end());

function createMockLocalTrack(source: Track.Source): LocalTrack {
  const track = {
    source,
    isMuted: false,
    isUpstreamPaused: false,
  } as Partial<LocalTrack> as LocalTrack;

  vi.mocked(track).mute = vi.fn().mockImplementation(() => {
    track.isMuted = true;
  });
  vi.mocked(track).unmute = vi.fn().mockImplementation(() => {
    track.isMuted = false;
  });
  vi.mocked(track).pauseUpstream = vi.fn().mockImplementation(() => {
    // @ts-expect-error - for that test we want to set isUpstreamPaused directly
    track.isUpstreamPaused = true;
  });
  vi.mocked(track).resumeUpstream = vi.fn().mockImplementation(() => {
    // @ts-expect-error - for that test we want to set isUpstreamPaused directly
    track.isUpstreamPaused = false;
  });

  return track;
}

function createMockMuteState(enabled$: BehaviorSubject<boolean>): {
  enabled$: BehaviorSubject<boolean>;
  syncing$: BehaviorSubject<boolean>;
  setHandler: (h: (enabled: boolean) => void) => void;
  unsetHandler: () => void;
} {
  let currentHandler = (enabled: boolean): void => {};

  const ms = {
    enabled$,
    syncing$: new BehaviorSubject(false),
    setHandler: vi.fn().mockImplementation((h: (enabled: boolean) => void) => {
      currentHandler = h;
    }),
    unsetHandler: vi.fn().mockImplementation(() => {
      currentHandler = (enabled: boolean): void => {};
    }),
  };
  // forward enabled$ emissions to the current handler
  enabled$.subscribe((enabled) => {
    logger.info(`MockMuteState: enabled changed to ${enabled}`);
    currentHandler(enabled);
  });

  return ms;
}

let connection: Connection;
let muteStates: MuteStates;
let localParticipant: LocalParticipant;
let audioEnabled$: BehaviorSubject<boolean>;
let videoEnabled$: BehaviorSubject<boolean>;
let trackPublications: LocalTrackPublication[];
// use it to control when track creation resolves, default to resolved
let createTrackLock: Promise<void>;

beforeEach(() => {
  trackPublications = [];
  audioEnabled$ = new BehaviorSubject(false);
  videoEnabled$ = new BehaviorSubject(false);
  createTrackLock = Promise.resolve();

  muteStates = {
    audio: createMockMuteState(audioEnabled$),
    video: createMockMuteState(videoEnabled$),
  } as unknown as MuteStates;

  const mockSendDataPacket = vi.fn();
  const mockEngine = {
    client: {
      sendUpdateLocalMetadata: vi.fn(),
    },
    on: vi.fn().mockReturnThis(),
    sendDataPacket: mockSendDataPacket,
  };

  localParticipant = new LocalParticipant(
    "local-sid",
    "local-identity",
    // @ts-expect-error - for that test we want a real LocalParticipant to have the pending publications logic
    mockEngine,
    {
      adaptiveStream: true,
      dynacase: false,
      audioCaptureDefaults: {},
      videoCaptureDefaults: {},
      stopLocalTrackOnUnpublish: true,
      reconnectPolicy: "always",
      disconnectOnPageLeave: true,
    },
    new Map(),
    {},
    {},
    {},
  );

  vi.mocked(localParticipant).createTracks = vi
    .fn()
    .mockImplementation(async (opts) => {
      const tracks: LocalTrack[] = [];
      if (opts.audio) {
        tracks.push(createMockLocalTrack(Track.Source.Microphone));
      }
      if (opts.video) {
        tracks.push(createMockLocalTrack(Track.Source.Camera));
      }
      await createTrackLock;
      return tracks;
    });

  vi.mocked(localParticipant).publishTrack = vi
    .fn()
    .mockImplementation(async (track: LocalTrack) => {
      const pub = {
        track,
        source: track.source,
        mute: track.mute,
        unmute: track.unmute,
      } as Partial<LocalTrackPublication> as LocalTrackPublication;
      trackPublications.push(pub);
      localParticipant.emit(ParticipantEvent.LocalTrackPublished, pub);
      return Promise.resolve(pub);
    });

  vi.mocked(localParticipant).getTrackPublication = vi
    .fn()
    .mockImplementation((source: Track.Source) => {
      return trackPublications.find((pub) => pub.track?.source === source);
    });

  connection = {
    state$: constant({
      state: "ConnectedToLkRoom",
      livekitConnectionState$: constant(LivekitConnectionState.Connected),
    }),
    livekitRoom: mockLivekitRoom({
      localParticipant: localParticipant,
    }),
  } as unknown as Connection;
});

describe("Publisher", () => {
  let publisher: Publisher;

  beforeEach(() => {
    publisher = new Publisher(
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );
  });

  afterEach(async () => {
    await publisher.destroy();
  });

  it("Should not create tracks if started muted to avoid unneeded permission requests", async () => {
    const createTracksSpy = vi.spyOn(
      connection.livekitRoom.localParticipant,
      "createTracks",
    );

    audioEnabled$.next(false);
    videoEnabled$.next(false);
    await publisher.createAndSetupTracks();

    expect(createTracksSpy).not.toHaveBeenCalled();
  });

  it("should unsetHandler and stop tracks on destroy", async () => {
    // setup all spies
    const unsetVideoSpy = vi.spyOn(
      (
        publisher as unknown as {
          muteStates: { video: { unsetHandler: () => void } };
        }
      ).muteStates.video,
      "unsetHandler",
    );
    const unsetAudioSpy = vi.spyOn(
      (
        publisher as unknown as {
          muteStates: { audio: { unsetHandler: () => void } };
        }
      ).muteStates.audio,
      "unsetHandler",
    );
    const scopeEndSpy = vi.spyOn(
      (publisher as unknown as { scope: { end: () => void } }).scope,
      "end",
    );
    const stopTracksSpy = vi.spyOn(publisher, "stopTracks");
    // destroy publisher
    await publisher.destroy();

    expect(stopTracksSpy).toHaveBeenCalledOnce();
    expect(unsetVideoSpy).toHaveBeenCalledOnce();
    expect(unsetAudioSpy).toHaveBeenCalledOnce();
    expect(scopeEndSpy).toHaveBeenCalled();
  });

  it("Should minimize permission request by querying create at once", async () => {
    const enableCameraAndMicrophoneSpy = vi.spyOn(
      localParticipant,
      "enableCameraAndMicrophone",
    );
    const createTracksSpy = vi.spyOn(localParticipant, "createTracks");

    audioEnabled$.next(true);
    videoEnabled$.next(true);
    await publisher.createAndSetupTracks();
    await flushPromises();

    expect(enableCameraAndMicrophoneSpy).toHaveBeenCalled();

    // It should create both at once
    expect(createTracksSpy).toHaveBeenCalledWith({
      audio: true,
      video: true,
    });
  });

  it("Ensure no data is streamed until publish has been called", async () => {
    audioEnabled$.next(true);
    await publisher.createAndSetupTracks();

    // The track should be created and paused
    expect(localParticipant.createTracks).toHaveBeenCalledWith({
      audio: true,
      video: undefined,
    });
    await flushPromises();
    expect(localParticipant.publishTrack).toHaveBeenCalled();

    await flushPromises();
    const track = localParticipant.getTrackPublication(
      Track.Source.Microphone,
    )?.track;
    expect(track).toBeDefined();
    expect(track!.pauseUpstream).toHaveBeenCalled();
    expect(track!.isUpstreamPaused).toBe(true);
  });

  it("Ensure resume upstream when published is called", async () => {
    videoEnabled$.next(true);
    await publisher.createAndSetupTracks();
    // await flushPromises();
    await publisher.startPublishing();

    const track = localParticipant.getTrackPublication(
      Track.Source.Camera,
    )?.track;
    expect(track).toBeDefined();
    // expect(track.pauseUpstream).toHaveBeenCalled();
    expect(track!.isUpstreamPaused).toBe(false);
  });

  describe("Mute states", () => {
    let publisher: Publisher;
    beforeEach(() => {
      publisher = new Publisher(
        connection,
        mockMediaDevices({}),
        muteStates,
        constant({ supported: false, processor: undefined }),
        logger,
      );
    });
    afterEach(async () => {
      await publisher.destroy();
    });

    test.each([
      { mutes: { audioEnabled: true, videoEnabled: false } },
      { mutes: { audioEnabled: true, videoEnabled: false } },
    ])("only create the tracks that are unmuted $mutes", async ({ mutes }) => {
      // Ensure all muted
      audioEnabled$.next(mutes.audioEnabled);
      videoEnabled$.next(mutes.videoEnabled);

      vi.mocked(connection.livekitRoom.localParticipant).createTracks = vi
        .fn()
        .mockResolvedValue([]);

      await publisher.createAndSetupTracks();

      expect(
        connection.livekitRoom.localParticipant.createTracks,
      ).toHaveBeenCalledOnce();

      expect(
        connection.livekitRoom.localParticipant.createTracks,
      ).toHaveBeenCalledWith({
        audio: mutes.audioEnabled ? true : undefined,
        video: mutes.videoEnabled ? true : undefined,
      });
    });
  });

  it("does mute unmute audio", async () => {});
});

describe("Bug fix", () => {
  // There is a race condition when creating and publishing tracks while the mute state changes.
  // This race condition could cause tracks to be published even though they are muted at the
  // beginning of a call coming from lobby.
  // This is caused by our stack using manually the low level API to create and publish tracks,
  // but also using the higher level setMicrophoneEnabled and setCameraEnabled functions that also create
  // and publish tracks, and managing pending publications.
  // Race is as follow, on creation of the Publisher we create the tracks then publish them.
  // If in the middle of that process the mute state changes:
  //  - the `setMicrophoneEnabled` will be no-op because it is not aware of our created track and can't see any pending publication
  //  - If start publication is requested it will publish the track even though there was a mute request.
  it("wrongly publish tracks while muted", async () => {
    // setLogLevel(`debug`);
    const publisher = new Publisher(
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );
    audioEnabled$.next(true);

    const resolvers = Promise.withResolvers<void>();
    createTrackLock = resolvers.promise;

    // Initially the audio is unmuted, so creating tracks should publish the audio track
    const createTracks = publisher.createAndSetupTracks();
    void publisher.startPublishing();
    void createTracks.then(() => {
      void publisher.startPublishing();
    });
    // now mute the audio before allowing track creation to complete
    audioEnabled$.next(false);
    resolvers.resolve(undefined);
    await createTracks;

    await flushPromises();

    const track = localParticipant.getTrackPublication(
      Track.Source.Microphone,
    )?.track;
    expect(track).toBeDefined();

    try {
      expect(localParticipant.publishTrack).not.toHaveBeenCalled();
    } catch {
      expect(track!.mute).toHaveBeenCalled();
      expect(track!.isMuted).toBe(true);
    }
    await publisher.destroy();
  });
});
