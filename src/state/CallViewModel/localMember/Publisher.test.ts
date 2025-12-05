/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import {
  ConnectionState as LivekitConenctionState,
  LocalParticipant,
  type LocalTrack,
  type LocalTrackPublication,
} from "livekit-client";
import { BehaviorSubject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { ObservableScope } from "../../ObservableScope";
import { constant } from "../../Behavior";
import {
  flushPromises,
  mockLivekitRoom,
  mockLocalParticipant,
  mockMediaDevices,
} from "../../../utils/test";
import { Publisher } from "./Publisher";
import {
  type Connection,
  type ConnectionState,
} from "../remoteMembers/Connection";
import { type MuteStates } from "../../MuteStates";
import { FailToStartLivekitConnection } from "../../../utils/errors";

let scope: ObservableScope;

beforeEach(() => {
  scope = new ObservableScope();
});

afterEach(() => scope.end());

describe("Publisher", () => {
  let connection: Connection;
  let muteStates: MuteStates;
  beforeEach(() => {
    muteStates = {
      audio: {
        enabled$: constant(false),
        unsetHandler: vi.fn(),
        setHandler: vi.fn(),
      },
      video: {
        enabled$: constant(false),
        unsetHandler: vi.fn(),
        setHandler: vi.fn(),
      },
    } as unknown as MuteStates;
    connection = {
      state$: constant({
        state: "ConnectedToLkRoom",
        livekitConnectionState$: constant(LivekitConenctionState.Connected),
      }),
      livekitRoom: mockLivekitRoom({
        localParticipant: mockLocalParticipant({}),
      }),
    } as unknown as Connection;
  });

  it("throws if livekit room could not publish", async () => {
    const publisher = new Publisher(
      scope,
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    // should do nothing if no tracks have been created yet.
    await publisher.startPublishing();
    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).not.toHaveBeenCalled();

    await expect(publisher.createAndSetupTracks()).rejects.toThrow(
      Error("audio and video is false"),
    );

    (muteStates.audio.enabled$ as BehaviorSubject<boolean>).next(true);

    (
      connection.livekitRoom.localParticipant.createTracks as Mock
    ).mockResolvedValue([{}, {}]);

    await expect(publisher.createAndSetupTracks()).resolves.not.toThrow();
    expect(
      connection.livekitRoom.localParticipant.createTracks,
    ).toHaveBeenCalledOnce();

    // failiour due to localParticipant.publishTrack
    (
      connection.livekitRoom.localParticipant.publishTrack as Mock
    ).mockRejectedValue(Error("testError"));

    await expect(publisher.startPublishing()).rejects.toThrow(
      new FailToStartLivekitConnection("testError"),
    );

    // does not try other conenction after the first one failed
    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).toHaveBeenCalledTimes(1);

    // failiour due to connection.state$
    const beforeState = connection.state$.value;
    (connection.state$ as BehaviorSubject<ConnectionState>).next({
      state: "FailedToStart",
      error: Error("testStartError"),
    });

    await expect(publisher.startPublishing()).rejects.toThrow(
      new FailToStartLivekitConnection("testStartError"),
    );
    (connection.state$ as BehaviorSubject<ConnectionState>).next(beforeState);

    // does not try other conenction after the first one failed
    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).toHaveBeenCalledTimes(1);

    // success case
    (
      connection.livekitRoom.localParticipant.publishTrack as Mock
    ).mockResolvedValue({});

    await expect(publisher.startPublishing()).resolves.not.toThrow();

    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).toHaveBeenCalledTimes(3);
  });
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
  it.fails("wrongly publish tracks while muted", async () => {
    const audioEnabled$ = new BehaviorSubject(true);
    const muteStates = {
      audio: {
        enabled$: audioEnabled$,
        unsetHandler: vi.fn(),
        setHandler: vi.fn(),
      },
      video: {
        enabled$: constant(false),
        unsetHandler: vi.fn(),
        setHandler: vi.fn(),
      },
    } as unknown as MuteStates;

    const mockSendDataPacket = vi.fn();
    const mockEngine = {
      client: {
        sendUpdateLocalMetadata: vi.fn(),
      },
      on: vi.fn().mockReturnThis(),
      sendDataPacket: mockSendDataPacket,
    };

    // cont mockRoomOptions = {} as InternalRoomOptions;

    const localParticipant = new LocalParticipant(
      "local-sid",
      "local-identity",
      // @ts-expect-error - for that test we want a real LocalParticipant to have the pending publications logic
      mockEngine,
      {},
      new Map(),
      {},
    );

    const connection = {
      state$: constant({
        state: "ConnectedToLkRoom",
        livekitConnectionState$: constant(LivekitConenctionState.Connected),
      }),
      livekitRoom: mockLivekitRoom({
        localParticipant,
      }),
    } as unknown as Connection;

    const mediaDevices = mockMediaDevices({});

    const mockTrack = vi.mocked<LocalTrack>({
      kind: "audio",
      mute: vi.fn(),
    } as Partial<LocalTrack> as LocalTrack);
    const createTrackLock = Promise.withResolvers<void>();
    const createTrackSpy = vi.spyOn(localParticipant, "createTracks");
    createTrackSpy.mockImplementation(async () => {
      await createTrackLock.promise;
      return [mockTrack];
    });

    const publishTrackSpy = vi.spyOn(localParticipant, "publishTrack");
    publishTrackSpy.mockResolvedValue({} as unknown as LocalTrackPublication);

    const publisher = new Publisher(
      scope,
      connection,
      mediaDevices,
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    // Initially the audio is unmuted, so creating tracks should publish the audio track
    const createTracks = publisher.createAndSetupTracks();
    publisher.tracks$.subscribe(() => {
      void publisher.startPublishing();
    });
    // now mute the audio before allowing track creation to complete
    audioEnabled$.next(false);
    // const publishing = publisher.startPublishing();
    createTrackLock.resolve();
    await createTracks;
    // await publishing;

    await flushPromises();

    // It should not publish or instead call track.mute()
    try {
      expect(publishTrackSpy).not.toHaveBeenCalled();
    } catch {
      expect(mockTrack.mute).toHaveBeenCalled();
    }
  });
});
