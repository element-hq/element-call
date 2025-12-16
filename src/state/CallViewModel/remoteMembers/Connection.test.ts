/*
Copyright 2025 Element Creations Ltd.
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  describe,
  expect,
  it,
  type MockedObject,
  onTestFinished,
  vi,
} from "vitest";
import {
  type LocalParticipant,
  type RemoteParticipant,
  type Room as LivekitRoom,
  RoomEvent,
  ConnectionState as LivekitConnectionState,
} from "livekit-client";
import fetchMock from "fetch-mock";
import EventEmitter from "events";
import { type IOpenIDToken } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import type { LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import {
  Connection,
  ConnectionState,
  type ConnectionOpts,
} from "./Connection.ts";
import { ObservableScope } from "../../ObservableScope.ts";
import { type OpenIDClientParts } from "../../../livekit/openIDSFU.ts";
import {
  ElementCallError,
  FailToGetOpenIdToken,
} from "../../../utils/errors.ts";
import { mockRemoteParticipant } from "../../../utils/test.ts";

let testScope: ObservableScope;

let client: MockedObject<OpenIDClientParts>;

let fakeLivekitRoom: MockedObject<LivekitRoom>;

let localParticipantEventEmiter: EventEmitter;
let fakeLocalParticipant: MockedObject<LocalParticipant>;

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

  const fakeRoomEventEmitter = new EventEmitter();
  fakeLivekitRoom = vi.mocked<LivekitRoom>({
    connect: vi.fn(),
    disconnect: vi.fn(),
    remoteParticipants: new Map(),
    localParticipant: fakeLocalParticipant,
    state: LivekitConnectionState.Disconnected,
    on: fakeRoomEventEmitter.on.bind(fakeRoomEventEmitter),
    off: fakeRoomEventEmitter.off.bind(fakeRoomEventEmitter),
    addListener: fakeRoomEventEmitter.addListener.bind(fakeRoomEventEmitter),
    removeListener:
      fakeRoomEventEmitter.removeListener.bind(fakeRoomEventEmitter),
    removeAllListeners:
      fakeRoomEventEmitter.removeAllListeners.bind(fakeRoomEventEmitter),
    setE2EEEnabled: vi.fn().mockResolvedValue(undefined),
    emit: (eventName: string | symbol, ...args: unknown[]) => {
      fakeRoomEventEmitter.emit(eventName, ...args);
    },
  } as unknown as LivekitRoom);
}

function setupRemoteConnection(): Connection {
  const opts: ConnectionOpts = {
    client: client,
    transport: livekitFocus,
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

  fakeLivekitRoom.connect.mockImplementation(async (): Promise<void> => {
    const changeEv = RoomEvent.ConnectionStateChanged;

    fakeLivekitRoom.state = LivekitConnectionState.Connecting;
    fakeLivekitRoom.emit(changeEv, fakeLivekitRoom.state);
    fakeLivekitRoom.state = LivekitConnectionState.Connected;
    fakeLivekitRoom.emit(changeEv, fakeLivekitRoom.state);

    return Promise.resolve();
  });

  return new Connection(opts, logger);
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
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    };
    const connection = new Connection(opts, logger);

    expect(connection.state$.getValue()).toEqual("Initialized");
  });

  it("fail to getOpenId token then error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts: ConnectionOpts = {
      client: client,
      transport: livekitFocus,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    };

    const connection = new Connection(opts, logger);

    const capturedStates: (ConnectionState | Error)[] = [];
    const s = connection.state$.subscribe((value) => {
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
    expect(capturedState!).toEqual("FetchingConfig");

    deferred.reject(new FailToGetOpenIdToken(new Error("Failed to get token")));

    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();
    if (capturedState instanceof Error) {
      expect(capturedState.message).toEqual("Something went wrong");
      expect(connection.transport.livekit_alias).toEqual(
        livekitFocus.livekit_alias,
      );
    } else {
      expect.fail("Expected FailedToStart state but got " + capturedState);
    }
  });

  it("fail to get JWT token and error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts: ConnectionOpts = {
      client: client,
      transport: livekitFocus,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    };

    const connection = new Connection(opts, logger);

    const capturedStates: (ConnectionState | Error)[] = [];
    const s = connection.state$.subscribe((value) => {
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
    expect(capturedState).toEqual(ConnectionState.FetchingConfig);

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();

    if (
      capturedState instanceof ElementCallError &&
      capturedState.cause instanceof Error
    ) {
      expect(capturedState.cause.message).toContain(
        "SFU Config fetch failed with exception Error",
      );
      expect(connection.transport.livekit_alias).toEqual(
        livekitFocus.livekit_alias,
      );
    } else {
      expect.fail("Expected FailedToStart state but got " + capturedState);
    }
  });

  it("fail to connect to livekit error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts: ConnectionOpts = {
      client: client,
      transport: livekitFocus,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    };

    const connection = new Connection(opts, logger);

    const capturedStates: (ConnectionState | Error)[] = [];
    const s = connection.state$.subscribe((value) => {
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

    expect(capturedState).toEqual(ConnectionState.FetchingConfig);

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();

    if (
      capturedState instanceof ElementCallError &&
      capturedState.cause instanceof Error
    ) {
      expect(capturedState.cause.message).toContain(
        "Failed to connect to livekit",
      );
      expect(connection.transport.livekit_alias).toEqual(
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

    const capturedStates: (ConnectionState | Error)[] = [];
    const s = connection.state$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    await connection.start();
    await vi.runAllTimersAsync();

    const initialState = capturedStates.shift();
    expect(initialState).toEqual(ConnectionState.Initialized);
    const fetchingState = capturedStates.shift();
    expect(fetchingState).toEqual(ConnectionState.FetchingConfig);
    const disconnectedState = capturedStates.shift();
    expect(disconnectedState).toEqual(ConnectionState.LivekitDisconnected);
    const connectingState = capturedStates.shift();
    expect(connectingState).toEqual(ConnectionState.LivekitConnecting);
    const connectedState = capturedStates.shift();
    expect(connectedState).toEqual(ConnectionState.LivekitConnected);
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

describe("remote participants", () => {
  it("emits the list of remote participants", () => {
    setupTest();

    const connection = setupRemoteConnection();

    const observedParticipants: RemoteParticipant[][] = [];
    const s = connection.remoteParticipants$.subscribe((participants) => {
      observedParticipants.push(participants);
    });
    onTestFinished(() => s.unsubscribe());
    // The remoteParticipants$ observable is derived from the current members of the
    // livekitRoom and the rtc membership in order to publish the members that are publishing
    // on this connection.

    const participants: RemoteParticipant[] = [
      mockRemoteParticipant({ identity: "@alice:example.org:DEV000" }),
      mockRemoteParticipant({ identity: "@bob:example.org:DEV111" }),
      mockRemoteParticipant({ identity: "@carol:example.org:DEV222" }),
      // Mock Dan to have no published tracks. We want him to still show show up
      // in the participants list.
      mockRemoteParticipant({
        identity: "@dan:example.org:DEV333",
        getTrackPublication: () => undefined,
        getTrackPublications: () => [],
      }),
    ];

    // Let's simulate 3 members on the livekitRoom
    vi.spyOn(fakeLivekitRoom, "remoteParticipants", "get").mockImplementation(
      () => new Map(participants.map((p) => [p.identity, p])),
    );

    participants.forEach((p) =>
      fakeLivekitRoom.emit(RoomEvent.ParticipantConnected, p),
    );

    // All remote participants should be present
    expect(observedParticipants.pop()!.length).toEqual(4);
  });

  it("should be scoped to parent scope", (): void => {
    setupTest();

    const connection = setupRemoteConnection();

    let observedParticipants: RemoteParticipant[][] = [];
    const s = connection.remoteParticipants$.subscribe((participants) => {
      observedParticipants.push(participants);
    });
    onTestFinished(() => s.unsubscribe());

    let participants: RemoteParticipant[] = [
      mockRemoteParticipant({ identity: "@bob:example.org:DEV111" }),
    ];

    // Let's simulate 3 members on the livekitRoom
    vi.spyOn(fakeLivekitRoom, "remoteParticipants", "get").mockImplementation(
      () => new Map(participants.map((p) => [p.identity, p])),
    );

    for (const participant of participants) {
      fakeLivekitRoom.emit(RoomEvent.ParticipantConnected, participant);
    }

    // We should have bob as a participant now
    const ps = observedParticipants.pop();
    expect(ps?.length).toEqual(1);
    expect(ps?.[0]?.identity).toEqual("@bob:example.org:DEV111");

    // end the parent scope
    testScope.end();
    observedParticipants = [];

    // SHOULD NOT emit any more participants as the scope is ended
    participants = participants.filter(
      (p) => p.identity !== "@bob:example.org:DEV111",
    );

    fakeLivekitRoom.emit(
      RoomEvent.ParticipantDisconnected,
      mockRemoteParticipant({ identity: "@bob:example.org:DEV111" }),
    );

    expect(observedParticipants.length).toEqual(0);
  });
});

//
// NOT USED ANYMORE ?
//
// This setup look like sth for the Publisher. Not a connection.

// describe("PublishConnection", () => {
//   // let fakeBlurProcessor: ProcessorWrapper<BackgroundOptions>;
//   let roomFactoryMock: Mock<() => LivekitRoom>;
//   let muteStates: MockedObject<MuteStates>;

//   function setUpPublishConnection(): void {
//     setupTest();

//     roomFactoryMock = vi.fn().mockReturnValue(fakeLivekitRoom);

//     muteStates = mockMuteStates();

//     // fakeBlurProcessor = vi.mocked<ProcessorWrapper<BackgroundOptions>>({
//     //   name: "BackgroundBlur",
//     //   restart: vi.fn().mockResolvedValue(undefined),
//     //   setOptions: vi.fn().mockResolvedValue(undefined),
//     //   getOptions: vi.fn().mockReturnValue({ strength: 0.5 }),
//     //   isRunning: vi.fn().mockReturnValue(false)
//     // });
//   }

// describe("Livekit room creation", () => {
//   function createSetup(): void {
//     setUpPublishConnection();

//     const fakeTrackProcessorSubject$ = new BehaviorSubject<ProcessorState>({
//       supported: true,
//       processor: undefined,
//     });

//     const opts: ConnectionOpts = {
//       client: client,
//       transport: livekitFocus,
//       scope: testScope,
//       livekitRoomFactory: roomFactoryMock,
//     };

//     const audioInput = {
//       available$: of(new Map([["mic1", { id: "mic1" }]])),
//       selected$: new BehaviorSubject({ id: "mic1" }),
//       select(): void {},
//     };

//     const videoInput = {
//       available$: of(new Map([["cam1", { id: "cam1" }]])),
//       selected$: new BehaviorSubject({ id: "cam1" }),
//       select(): void {},
//     };

//     const audioOutput = {
//       available$: of(new Map([["speaker", { id: "speaker" }]])),
//       selected$: new BehaviorSubject({ id: "speaker" }),
//       select(): void {},
//     };

//     // TODO understand what is wrong with our mocking that requires ts-expect-error
//     const fakeDevices = mockMediaDevices({
//       // @ts-expect-error Mocking only
//       audioInput,
//       // @ts-expect-error Mocking only
//       videoInput,
//       // @ts-expect-error Mocking only
//       audioOutput,
//     });

//     new Connection(
//       opts,
//       fakeDevices,
//       muteStates,
//       undefined,
//       fakeTrackProcessorSubject$,
//     );
//   }

//   it("should create room with proper initial audio and video settings", () => {
//     createSetup();

//     expect(roomFactoryMock).toHaveBeenCalled();

//     const lastCallArgs =
//       roomFactoryMock.mock.calls[roomFactoryMock.mock.calls.length - 1];

//     const roomOptions = lastCallArgs.pop() as unknown as RoomOptions;
//     expect(roomOptions).toBeDefined();

//     expect(roomOptions!.videoCaptureDefaults?.deviceId).toEqual("cam1");
//     expect(roomOptions!.audioCaptureDefaults?.deviceId).toEqual("mic1");
//     expect(roomOptions!.audioOutput?.deviceId).toEqual("speaker");
//   });

//   it("respect controlledAudioDevices", () => {
//     // TODO: Refactor the code to make it testable.
//     // The UrlParams module is a singleton has a cache and is very hard to test.
//     // This breaks other tests as well if not handled properly.
//     // vi.mock(import("./../UrlParams"), () => {
//     //   return {
//     //     getUrlParams: vi.fn().mockReturnValue({
//     //       controlledAudioDevices: true
//     //     })
//     //   };
//     // });
//   });
// });
// });
