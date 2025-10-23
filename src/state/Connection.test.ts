/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  describe,
  expect,
  it,
  type Mock,
  type MockedObject,
  onTestFinished,
  vi,
} from "vitest";
import { BehaviorSubject, of } from "rxjs";
import {
  ConnectionState,
  type LocalParticipant,
  type RemoteParticipant,
  type Room as LivekitRoom,
  RoomEvent,
  type RoomOptions,
} from "livekit-client";
import fetchMock from "fetch-mock";
import EventEmitter from "events";
import { type IOpenIDToken } from "matrix-js-sdk";

import type {
  CallMembership,
  LivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  type ConnectionOpts,
  type TransportState,
  type PublishingParticipant,
  RemoteConnection,
} from "./Connection.ts";
import { ObservableScope } from "./ObservableScope.ts";
import { type OpenIDClientParts } from "../livekit/openIDSFU.ts";
import { FailToGetOpenIdToken } from "../utils/errors.ts";
import { PublishConnection } from "./PublishConnection.ts";
import { mockMediaDevices, mockMuteStates } from "../utils/test.ts";
import type { ProcessorState } from "../livekit/TrackProcessorContext.tsx";
import { type MuteStates } from "./MuteStates.ts";

let testScope: ObservableScope;

let client: MockedObject<OpenIDClientParts>;

let fakeLivekitRoom: MockedObject<LivekitRoom>;

let localParticipantEventEmiter: EventEmitter;
let fakeLocalParticipant: MockedObject<LocalParticipant>;

let fakeRoomEventEmiter: EventEmitter;
let fakeMembershipsFocusMap$: BehaviorSubject<
  { membership: CallMembership; transport: LivekitTransport }[]
>;

const livekitFocus: LivekitTransport = {
  livekit_alias: "!roomID:example.org",
  livekit_service_url: "https://matrix-rtc.example.org/livekit/jwt",
  type: "livekit",
};

function setupTest(): void {
  testScope = new ObservableScope();
  client = vi.mocked<OpenIDClientParts>({
    getOpenIdToken: vi.fn().mockResolvedValue({
      access_token: "rYsmGUEwNjKgJYyeNUkZseJN",
      token_type: "Bearer",
      matrix_server_name: "example.org",
      expires_in: 3600,
    }),
    getDeviceId: vi.fn().mockReturnValue("ABCDEF"),
  } as unknown as OpenIDClientParts);
  fakeMembershipsFocusMap$ = new BehaviorSubject<
    { membership: CallMembership; transport: LivekitTransport }[]
  >([]);

  localParticipantEventEmiter = new EventEmitter();

  fakeLocalParticipant = vi.mocked<LocalParticipant>({
    identity: "@me:example.org",
    isMicrophoneEnabled: vi.fn().mockReturnValue(true),
    getTrackPublication: vi.fn().mockReturnValue(undefined),
    on: localParticipantEventEmiter.on.bind(localParticipantEventEmiter),
    off: localParticipantEventEmiter.off.bind(localParticipantEventEmiter),
    addListener: localParticipantEventEmiter.addListener.bind(
      localParticipantEventEmiter,
    ),
    removeListener: localParticipantEventEmiter.removeListener.bind(
      localParticipantEventEmiter,
    ),
    removeAllListeners: localParticipantEventEmiter.removeAllListeners.bind(
      localParticipantEventEmiter,
    ),
  } as unknown as LocalParticipant);
  fakeRoomEventEmiter = new EventEmitter();

  fakeLivekitRoom = vi.mocked<LivekitRoom>({
    connect: vi.fn(),
    disconnect: vi.fn(),
    remoteParticipants: new Map(),
    localParticipant: fakeLocalParticipant,
    state: ConnectionState.Disconnected,
    on: fakeRoomEventEmiter.on.bind(fakeRoomEventEmiter),
    off: fakeRoomEventEmiter.off.bind(fakeRoomEventEmiter),
    addListener: fakeRoomEventEmiter.addListener.bind(fakeRoomEventEmiter),
    removeListener:
      fakeRoomEventEmiter.removeListener.bind(fakeRoomEventEmiter),
    removeAllListeners:
      fakeRoomEventEmiter.removeAllListeners.bind(fakeRoomEventEmiter),
    setE2EEEnabled: vi.fn().mockResolvedValue(undefined),
  } as unknown as LivekitRoom);
}

function setupRemoteConnection(): RemoteConnection {
  const opts: ConnectionOpts = {
    client: client,
    transport: livekitFocus,
    remoteTransports$: fakeMembershipsFocusMap$,
    scope: testScope,
    livekitRoomFactory: () => fakeLivekitRoom,
  };

  fetchMock.post(`${livekitFocus.livekit_service_url}/sfu/get`, () => {
    return {
      status: 200,
      body: {
        url: "wss://matrix-rtc.m.localhost/livekit/sfu",
        jwt: "ATOKEN",
      },
    };
  });

  fakeLivekitRoom.connect.mockResolvedValue(undefined);

  return new RemoteConnection(opts, undefined);
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  fetchMock.reset();
});

describe("Start connection states", () => {
  it("start in initialized state", () => {
    setupTest();

    const opts: ConnectionOpts = {
      client: client,
      transport: livekitFocus,
      remoteTransports$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    };
    const connection = new RemoteConnection(opts, undefined);

    expect(connection.transportState$.getValue().state).toEqual("Initialized");
  });

  it("fail to getOpenId token then error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts: ConnectionOpts = {
      client: client,
      transport: livekitFocus,
      remoteTransports$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    };

    const connection = new RemoteConnection(opts, undefined);

    const capturedStates: TransportState[] = [];
    const s = connection.transportState$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    const deferred = Promise.withResolvers<IOpenIDToken>();

    client.getOpenIdToken.mockImplementation(
      async (): Promise<IOpenIDToken> => {
        return await deferred.promise;
      },
    );

    connection.start().catch(() => {
      // expected to throw
    });

    let capturedState = capturedStates.pop();
    expect(capturedState).toBeDefined();
    expect(capturedState!.state).toEqual("FetchingConfig");

    deferred.reject(new FailToGetOpenIdToken(new Error("Failed to get token")));

    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();
    if (capturedState!.state === "FailedToStart") {
      expect(capturedState!.error.message).toEqual("Something went wrong");
      expect(capturedState!.transport.livekit_alias).toEqual(
        livekitFocus.livekit_alias,
      );
    } else {
      expect.fail(
        "Expected FailedToStart state but got " + capturedState?.state,
      );
    }
  });

  it("fail to get JWT token and error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts: ConnectionOpts = {
      client: client,
      transport: livekitFocus,
      remoteTransports$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    };

    const connection = new RemoteConnection(opts, undefined);

    const capturedStates: TransportState[] = [];
    const s = connection.transportState$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    const deferredSFU = Promise.withResolvers<void>();
    // mock the /sfu/get call
    fetchMock.post(`${livekitFocus.livekit_service_url}/sfu/get`, async () => {
      await deferredSFU.promise;
      return {
        status: 500,
        body: "Internal Server Error",
      };
    });

    connection.start().catch(() => {
      // expected to throw
    });

    let capturedState = capturedStates.pop();
    expect(capturedState).toBeDefined();
    expect(capturedState?.state).toEqual("FetchingConfig");

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();

    if (capturedState?.state === "FailedToStart") {
      expect(capturedState?.error.message).toContain(
        "SFU Config fetch failed with exception Error",
      );
      expect(capturedState?.transport.livekit_alias).toEqual(
        livekitFocus.livekit_alias,
      );
    } else {
      expect.fail(
        "Expected FailedToStart state but got " + capturedState?.state,
      );
    }
  });

  it("fail to connect to livekit error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts: ConnectionOpts = {
      client: client,
      transport: livekitFocus,
      remoteTransports$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    };

    const connection = new RemoteConnection(opts, undefined);

    const capturedStates: TransportState[] = [];
    const s = connection.transportState$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    const deferredSFU = Promise.withResolvers<void>();
    // mock the /sfu/get call
    fetchMock.post(`${livekitFocus.livekit_service_url}/sfu/get`, () => {
      return {
        status: 200,
        body: {
          url: "wss://matrix-rtc.m.localhost/livekit/sfu",
          jwt: "ATOKEN",
        },
      };
    });

    fakeLivekitRoom.connect.mockImplementation(async () => {
      await deferredSFU.promise;
      throw new Error("Failed to connect to livekit");
    });

    connection.start().catch(() => {
      // expected to throw
    });

    let capturedState = capturedStates.pop();
    expect(capturedState).toBeDefined();

    expect(capturedState?.state).toEqual("FetchingConfig");

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();

    if (capturedState && capturedState?.state === "FailedToStart") {
      expect(capturedState.error.message).toContain(
        "Failed to connect to livekit",
      );
      expect(capturedState.transport.livekit_alias).toEqual(
        livekitFocus.livekit_alias,
      );
    } else {
      expect.fail(
        "Expected FailedToStart state but got " + JSON.stringify(capturedState),
      );
    }
  });

  it("connection states happy path", async () => {
    vi.useFakeTimers();
    setupTest();

    const connection = setupRemoteConnection();

    const capturedStates: TransportState[] = [];
    const s = connection.transportState$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    await connection.start();
    await vi.runAllTimersAsync();

    const initialState = capturedStates.shift();
    expect(initialState?.state).toEqual("Initialized");
    const fetchingState = capturedStates.shift();
    expect(fetchingState?.state).toEqual("FetchingConfig");
    const connectingState = capturedStates.shift();
    expect(connectingState?.state).toEqual("ConnectingToLkRoom");
    const connectedState = capturedStates.shift();
    expect(connectedState?.state).toEqual("ConnectedToLkRoom");
  });

  it("shutting down the scope should stop the connection", async () => {
    setupTest();
    vi.useFakeTimers();

    const connection = setupRemoteConnection();
    await connection.start();

    const stopSpy = vi.spyOn(connection, "stop");
    testScope.end();

    expect(stopSpy).toHaveBeenCalled();
    expect(fakeLivekitRoom.disconnect).toHaveBeenCalled();
  });
});

function fakeRemoteLivekitParticipant(id: string): RemoteParticipant {
  return {
    identity: id,
  } as unknown as RemoteParticipant;
}

function fakeRtcMemberShip(userId: string, deviceId: string): CallMembership {
  return {
    userId,
    deviceId,
  } as unknown as CallMembership;
}

describe("Publishing participants observations", () => {
  it("should emit the list of publishing participants", async () => {
    setupTest();

    const connection = setupRemoteConnection();

    const bobIsAPublisher = Promise.withResolvers<void>();
    const danIsAPublisher = Promise.withResolvers<void>();
    const observedPublishers: PublishingParticipant[][] = [];
    const s = connection.publishingParticipants$.subscribe((publishers) => {
      observedPublishers.push(publishers);
      if (
        publishers.some(
          (p) => p.participant?.identity === "@bob:example.org:DEV111",
        )
      ) {
        bobIsAPublisher.resolve();
      }
      if (
        publishers.some(
          (p) => p.participant?.identity === "@dan:example.org:DEV333",
        )
      ) {
        danIsAPublisher.resolve();
      }
    });
    onTestFinished(() => s.unsubscribe());
    // The publishingParticipants$ observable is derived from the current members of the
    // livekitRoom and the rtc membership in order to publish the members that are publishing
    // on this connection.

    let participants: RemoteParticipant[] = [
      fakeRemoteLivekitParticipant("@alice:example.org:DEV000"),
      fakeRemoteLivekitParticipant("@bob:example.org:DEV111"),
      fakeRemoteLivekitParticipant("@carol:example.org:DEV222"),
      fakeRemoteLivekitParticipant("@dan:example.org:DEV333"),
    ];

    // Let's simulate 3 members on the livekitRoom
    vi.spyOn(fakeLivekitRoom, "remoteParticipants", "get").mockReturnValue(
      new Map(participants.map((p) => [p.identity, p])),
    );

    for (const participant of participants) {
      fakeRoomEventEmiter.emit(RoomEvent.ParticipantConnected, participant);
    }

    // At this point there should be no publishers
    expect(observedPublishers.pop()!.length).toEqual(0);

    const otherFocus: LivekitTransport = {
      livekit_alias: "!roomID:example.org",
      livekit_service_url: "https://other-matrix-rtc.example.org/livekit/jwt",
      type: "livekit",
    };

    const rtcMemberships = [
      // Say bob is on the same focus
      {
        membership: fakeRtcMemberShip("@bob:example.org", "DEV111"),
        transport: livekitFocus,
      },
      // Alice and carol is on a different focus
      {
        membership: fakeRtcMemberShip("@alice:example.org", "DEV000"),
        transport: otherFocus,
      },
      {
        membership: fakeRtcMemberShip("@carol:example.org", "DEV222"),
        transport: otherFocus,
      },
      // NO DAVE YET
    ];
    // signal this change in rtc memberships
    fakeMembershipsFocusMap$.next(rtcMemberships);

    // We should have bob has a publisher now
    await bobIsAPublisher.promise;
    const publishers = observedPublishers.pop();
    expect(publishers?.length).toEqual(1);
    expect(publishers?.[0].participant?.identity).toEqual(
      "@bob:example.org:DEV111",
    );

    // Now let's make dan join the rtc memberships
    rtcMemberships.push({
      membership: fakeRtcMemberShip("@dan:example.org", "DEV333"),
      transport: livekitFocus,
    });
    fakeMembershipsFocusMap$.next(rtcMemberships);

    // We should have bob and dan has publishers now
    await danIsAPublisher.promise;
    const twoPublishers = observedPublishers.pop();
    expect(twoPublishers?.length).toEqual(2);
    expect(
      twoPublishers?.some(
        (p) => p.participant?.identity === "@bob:example.org:DEV111",
      ),
    ).toBeTruthy();
    expect(
      twoPublishers?.some(
        (p) => p.participant?.identity === "@dan:example.org:DEV333",
      ),
    ).toBeTruthy();

    // Now let's make bob leave the livekit room
    participants = participants.filter(
      (p) => p.identity !== "@bob:example.org:DEV111",
    );
    vi.spyOn(fakeLivekitRoom, "remoteParticipants", "get").mockReturnValue(
      new Map(participants.map((p) => [p.identity, p])),
    );
    fakeRoomEventEmiter.emit(
      RoomEvent.ParticipantDisconnected,
      fakeRemoteLivekitParticipant("@bob:example.org:DEV111"),
    );

    const updatedPublishers = observedPublishers.pop();
    // Bob is not connected to the room but he is still in the rtc memberships declaring that
    // he is using that focus to publish, so he should still appear as a publisher
    expect(updatedPublishers?.length).toEqual(2);
    const pp = updatedPublishers?.find(
      (p) => p.membership.userId == "@bob:example.org",
    );
    expect(pp).toBeDefined();
    expect(pp!.participant).not.toBeDefined();
    expect(
      updatedPublishers?.some(
        (p) => p.participant?.identity === "@dan:example.org:DEV333",
      ),
    ).toBeTruthy();
    // Now if bob is not in the rtc memberships, he should disappear
    const noBob = rtcMemberships.filter(
      ({ membership }) => membership.userId !== "@bob:example.org",
    );
    fakeMembershipsFocusMap$.next(noBob);
    expect(observedPublishers.pop()?.length).toEqual(1);
  });

  it("should be scoped to parent scope", (): void => {
    setupTest();

    const connection = setupRemoteConnection();

    let observedPublishers: PublishingParticipant[][] = [];
    const s = connection.publishingParticipants$.subscribe((publishers) => {
      observedPublishers.push(publishers);
    });
    onTestFinished(() => s.unsubscribe());

    let participants: RemoteParticipant[] = [
      fakeRemoteLivekitParticipant("@bob:example.org:DEV111"),
    ];

    // Let's simulate 3 members on the livekitRoom
    vi.spyOn(fakeLivekitRoom, "remoteParticipants", "get").mockReturnValue(
      new Map(participants.map((p) => [p.identity, p])),
    );

    for (const participant of participants) {
      fakeRoomEventEmiter.emit(RoomEvent.ParticipantConnected, participant);
    }

    // At this point there should be no publishers
    expect(observedPublishers.pop()!.length).toEqual(0);

    const rtcMemberships = [
      // Say bob is on the same focus
      {
        membership: fakeRtcMemberShip("@bob:example.org", "DEV111"),
        transport: livekitFocus,
      },
    ];
    // signal this change in rtc memberships
    fakeMembershipsFocusMap$.next(rtcMemberships);

    // We should have bob has a publisher now
    const publishers = observedPublishers.pop();
    expect(publishers?.length).toEqual(1);
    expect(publishers?.[0].participant?.identity).toEqual(
      "@bob:example.org:DEV111",
    );

    // end the parent scope
    testScope.end();
    observedPublishers = [];

    // SHOULD NOT emit any more publishers as the scope is ended
    participants = participants.filter(
      (p) => p.identity !== "@bob:example.org:DEV111",
    );
    vi.spyOn(fakeLivekitRoom, "remoteParticipants", "get").mockReturnValue(
      new Map(participants.map((p) => [p.identity, p])),
    );
    fakeRoomEventEmiter.emit(
      RoomEvent.ParticipantDisconnected,
      fakeRemoteLivekitParticipant("@bob:example.org:DEV111"),
    );

    expect(observedPublishers.length).toEqual(0);
  });
});

describe("PublishConnection", () => {
  // let fakeBlurProcessor: ProcessorWrapper<BackgroundOptions>;
  let roomFactoryMock: Mock<() => LivekitRoom>;
  let muteStates: MockedObject<MuteStates>;

  function setUpPublishConnection(): void {
    setupTest();

    roomFactoryMock = vi.fn().mockReturnValue(fakeLivekitRoom);

    muteStates = mockMuteStates();

    // fakeBlurProcessor = vi.mocked<ProcessorWrapper<BackgroundOptions>>({
    //   name: "BackgroundBlur",
    //   restart: vi.fn().mockResolvedValue(undefined),
    //   setOptions: vi.fn().mockResolvedValue(undefined),
    //   getOptions: vi.fn().mockReturnValue({ strength: 0.5 }),
    //   isRunning: vi.fn().mockReturnValue(false)
    // });
  }

  describe("Livekit room creation", () => {
    function createSetup(): void {
      setUpPublishConnection();

      const fakeTrackProcessorSubject$ = new BehaviorSubject<ProcessorState>({
        supported: true,
        processor: undefined,
      });

      const opts: ConnectionOpts = {
        client: client,
        transport: livekitFocus,
        remoteTransports$: fakeMembershipsFocusMap$,
        scope: testScope,
        livekitRoomFactory: roomFactoryMock,
      };

      const audioInput = {
        available$: of(new Map([["mic1", { id: "mic1" }]])),
        selected$: new BehaviorSubject({ id: "mic1" }),
        select(): void {},
      };

      const videoInput = {
        available$: of(new Map([["cam1", { id: "cam1" }]])),
        selected$: new BehaviorSubject({ id: "cam1" }),
        select(): void {},
      };

      const audioOutput = {
        available$: of(new Map([["speaker", { id: "speaker" }]])),
        selected$: new BehaviorSubject({ id: "speaker" }),
        select(): void {},
      };

      // TODO understand what is wrong with our mocking that requires ts-expect-error
      const fakeDevices = mockMediaDevices({
        // @ts-expect-error Mocking only
        audioInput,
        // @ts-expect-error Mocking only
        videoInput,
        // @ts-expect-error Mocking only
        audioOutput,
      });

      new PublishConnection(
        opts,
        fakeDevices,
        muteStates,
        undefined,
        fakeTrackProcessorSubject$,
      );
    }

    it("should create room with proper initial audio and video settings", () => {
      createSetup();

      expect(roomFactoryMock).toHaveBeenCalled();

      const lastCallArgs =
        roomFactoryMock.mock.calls[roomFactoryMock.mock.calls.length - 1];

      const roomOptions = lastCallArgs.pop() as unknown as RoomOptions;
      expect(roomOptions).toBeDefined();

      expect(roomOptions!.videoCaptureDefaults?.deviceId).toEqual("cam1");
      expect(roomOptions!.audioCaptureDefaults?.deviceId).toEqual("mic1");
      expect(roomOptions!.audioOutput?.deviceId).toEqual("speaker");
    });

    it("respect controlledAudioDevices", () => {
      // TODO: Refactor the code to make it testable.
      // The UrlParams module is a singleton has a cache and is very hard to test.
      // This breaks other tests as well if not handled properly.
      // vi.mock(import("./../UrlParams"), () => {
      //   return {
      //     getUrlParams: vi.fn().mockReturnValue({
      //       controlledAudioDevices: true
      //     })
      //   };
      // });
    });
  });
});
