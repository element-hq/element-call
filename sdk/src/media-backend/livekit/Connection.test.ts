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
  type Mock,
  type MockedObject,
  onTestFinished,
  vi,
} from "vitest";
import {
  type LocalParticipant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Room as LivekitRoom,
  RoomEvent,
  Track,
  ConnectionState as LivekitConnectionState,
} from "livekit-client";
import fetchMock from "fetch-mock";
import EventEmitter from "events";
import { MatrixError } from "matrix-js-sdk";
import { logger, type Logger } from "matrix-js-sdk/lib/logger";
import {
  type LivekitGetTokenResponse,
  type UnstableLivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";

import {
  Connection,
  type ConnectionState,
  type ConnectionOpts,
} from "./Connection.ts";
import { ObservableScope } from "../../reactive/ObservableScope";
import { type ClientGetTokenParts, type ClientOpenIDParts } from "./auth";
import { MatrixRTCError } from "../../errors";
import { testJWTToken } from "../../utils/test-fixtures";
import { ownMemberMock } from "../../utils/test";
import { mockRemoteParticipant } from "./test";

let testScope: ObservableScope;

let client: MockedObject<ClientGetTokenParts & ClientOpenIDParts>;

let fakeLivekitRoom: MockedObject<LivekitRoom>;

let localParticipantEventEmiter: EventEmitter;
let fakeLocalParticipant: MockedObject<LocalParticipant>;

const ROOM_ID = "!roomID:example.org";
const SLOT_ID = "m.call#ROOM";
const FIREFOX_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0";

const transport: UnstableLivekitTransport = {
  type: "livekit",
  url: "wss://matrix-rtc.m.localhost/livekit/sfu",
};

/** The options of a subscriber connection to `transport`. */
function connectionOpts(): ConnectionOpts {
  return {
    client,
    roomId: ROOM_ID,
    slotId: SLOT_ID,
    role: "subscriber",
    transport,
    serverName: "m.localhost",
    scope: testScope,
    ownMembershipIdentity: ownMemberMock,
    livekitRoomFactory: () => fakeLivekitRoom,
  };
}

function setupTest(): void {
  testScope = new ObservableScope();
  client = vi.mocked<ClientGetTokenParts & ClientOpenIDParts>({
    getOpenIdToken: vi.fn().mockResolvedValue({
      access_token: "rYsmGUEwNjKgJYyeNUkZseJN",
      token_type: "Bearer",
      matrix_server_name: "example.org",
      expires_in: 3600,
    }),
    _unstable_getLivekitToken: vi.fn().mockResolvedValue({ jwt: testJWTToken }),
  });

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
  const opts = connectionOpts();

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

interface FakeWebSocket {
  url: string;
  close: Mock<() => void>;
  onopen: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
}

function stubWebSocket(): FakeWebSocket[] {
  const sockets: FakeWebSocket[] = [];
  vi.stubGlobal(
    "WebSocket",
    class implements FakeWebSocket {
      public close = vi.fn();
      public onopen: ((ev: Event) => void) | null = null;
      public onclose: ((ev: CloseEvent) => void) | null = null;
      public constructor(public url: string) {
        sockets.push(this);
      }
    },
  );
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return sockets;
}

function mockUserAgent(userAgent: string): void {
  const spy = vi
    .spyOn(navigator, "userAgent", "get")
    .mockReturnValue(userAgent);
  onTestFinished(() => spy.mockRestore());
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  fetchMock.reset();
});

describe("Start connection states", () => {
  it("start in initialized state", () => {
    setupTest();

    const opts = connectionOpts();
    const connection = new Connection(opts, logger);

    expect(connection.state$.getValue()).toEqual({ state: "initialized" });
  });

  it("fail to get SFU token then error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts = connectionOpts();

    const connection = new Connection(opts, logger);

    const capturedStates: ConnectionState[] = [];
    const s = connection.state$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    const deferred = Promise.withResolvers<LivekitGetTokenResponse>();

    client._unstable_getLivekitToken.mockImplementation(
      async (): Promise<LivekitGetTokenResponse> => {
        return await deferred.promise;
      },
    );

    connection.start().catch(() => {
      // expected to throw
    });

    let capturedState = capturedStates.pop();
    expect(capturedState).toBeDefined();
    expect(capturedState).toEqual({ state: "authenticating" });

    deferred.reject(new MatrixRTCError("Failed to get token"));

    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();
    if (capturedState?.state === "error") {
      expect(capturedState.error.message).toEqual("Failed to get token");
      expect(connection.transport).toEqual(transport);
    } else {
      expect.fail(
        "Expected error state but got " + JSON.stringify(capturedState),
      );
    }
  });

  it("fail to get JWT token and error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts = connectionOpts();

    const connection = new Connection(opts, logger);

    const capturedStates: ConnectionState[] = [];
    const s = connection.state$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    const deferredSFU = Promise.withResolvers<void>();
    client._unstable_getLivekitToken.mockImplementation(async () => {
      await deferredSFU.promise;
      throw new MatrixError(
        {
          errcode: "M_LOOKUP_FAILED",
          error: "Failed to look up user info from homeserver",
        },
        500,
      );
    });

    connection.start().catch(() => {
      // expected to throw
    });

    let capturedState = capturedStates.pop();
    expect(capturedState).toBeDefined();
    expect(capturedState).toEqual({ state: "authenticating" });

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();

    if (
      capturedState?.state === "error" &&
      capturedState.error.cause instanceof Error
    ) {
      expect(capturedState.error.cause.message).toContain(
        "Failed to look up user info from homeserver",
      );
      expect(connection.transport).toEqual(transport);
    } else {
      expect.fail(
        "Expected error state but got " + JSON.stringify(capturedState),
      );
    }
  });

  it("fail to connect to livekit error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts = connectionOpts();

    const connection = new Connection(opts, logger);

    const capturedStates: ConnectionState[] = [];
    const s = connection.state$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    const deferredSFU = Promise.withResolvers<void>();
    fakeLivekitRoom.connect.mockImplementation(async () => {
      await deferredSFU.promise;
      throw new Error("Failed to connect to livekit");
    });

    connection.start().catch(() => {
      // expected to throw
    });

    let capturedState = capturedStates.pop();
    expect(capturedState).toBeDefined();

    expect(capturedState).toEqual({ state: "authenticating" });

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();

    if (
      capturedState?.state === "error" &&
      capturedState.error.cause instanceof Error
    ) {
      expect(capturedState.error.cause.message).toContain(
        "Failed to connect to livekit",
      );
      expect(connection.transport).toEqual(transport);
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

    const capturedStates: ConnectionState[] = [];
    const s = connection.state$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    await connection.start();
    await vi.runAllTimersAsync();

    const initialState = capturedStates.shift();
    expect(initialState).toEqual({ state: "initialized" });
    const fetchingState = capturedStates.shift();
    expect(fetchingState).toEqual({ state: "authenticating" });
    const disconnectedState = capturedStates.shift();
    expect(disconnectedState).toEqual({
      state: "authenticated",
      livekitState: LivekitConnectionState.Disconnected,
    });
    const connectingState = capturedStates.shift();
    expect(connectingState).toEqual({
      state: "authenticated",
      livekitState: LivekitConnectionState.Connecting,
    });
    const connectedState = capturedStates.shift();
    expect(connectedState).toEqual({
      state: "authenticated",
      livekitState: LivekitConnectionState.Connected,
    });
  });

  it("authenticates a publisher on a livekit_service_url transport through the JWT service", async () => {
    setupTest();
    const serviceUrl = "https://matrix-rtc.example.org/livekit/jwt";
    fetchMock.post(`${serviceUrl}/sfu/get`, {
      status: 200,
      body: { url: "wss://sfu", jwt: testJWTToken },
    });
    fakeLivekitRoom.connect.mockResolvedValue(undefined);
    const connection = new Connection(
      {
        ...connectionOpts(),
        role: "publisher",
        transport: { type: "livekit", livekit_service_url: serviceUrl },
      },
      logger,
    );

    await connection.start();

    expect(client._unstable_getLivekitToken).not.toHaveBeenCalled();
    expect(fetchMock.called(`${serviceUrl}/sfu/get`)).toBe(true);
    expect(fakeLivekitRoom.connect).toHaveBeenCalledWith(
      "wss://sfu",
      testJWTToken,
    );
    expect(connection.livekitAlias).toBe("!example_room_id");
  });

  it("connects in Firefox once a primed WebSocket to the SFU has closed", async () => {
    setupTest();
    const sockets = stubWebSocket();
    mockUserAgent(FIREFOX_USER_AGENT);
    const connection = setupRemoteConnection();

    const started = connection.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(sockets[0].url).toBe(transport.url);
    sockets[0].onopen?.(new Event("open"));
    expect(sockets[0].close).toHaveBeenCalled();
    expect(fakeLivekitRoom.connect).not.toHaveBeenCalled();

    sockets[0].onclose?.(new CloseEvent("close"));
    await started;

    expect(fakeLivekitRoom.connect).toHaveBeenCalled();
  });

  it("connects in Firefox if a primed WebSocket does not close in time", async () => {
    setupTest();
    vi.useFakeTimers();
    const sockets = stubWebSocket();
    mockUserAgent(FIREFOX_USER_AGENT);
    const connection = setupRemoteConnection();

    const started = connection.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(fakeLivekitRoom.connect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    await started;

    expect(fakeLivekitRoom.connect).toHaveBeenCalled();
  });

  it("does not connect if stopped while priming the WebSocket", async () => {
    setupTest();
    const sockets = stubWebSocket();
    mockUserAgent(FIREFOX_USER_AGENT);
    const connection = setupRemoteConnection();

    const started = connection.start();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    await connection.stop();
    sockets[0].onclose?.(new CloseEvent("close"));
    await started;

    expect(fakeLivekitRoom.connect).not.toHaveBeenCalled();
  });

  it("does not prime a WebSocket in other browsers", async () => {
    setupTest();
    const sockets = stubWebSocket();
    mockUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    );
    const connection = setupRemoteConnection();

    await connection.start();

    expect(fakeLivekitRoom.connect).toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
  });

  it("stopping while connecting does not report an error", async () => {
    setupTest();
    const connection = setupRemoteConnection();

    const capturedStates: ConnectionState[] = [];
    const s = connection.state$.subscribe((value) => {
      capturedStates.push(value);
    });
    onTestFinished(() => s.unsubscribe());

    // livekit-client rejects a pending connect() when disconnect() is called.
    const pendingConnect = Promise.withResolvers<void>();
    fakeLivekitRoom.connect.mockReturnValue(pendingConnect.promise);
    fakeLivekitRoom.disconnect.mockResolvedValue(undefined);

    const started = connection.start();
    await vi.waitFor(() => expect(fakeLivekitRoom.connect).toHaveBeenCalled());
    const stopping = connection.stop();
    pendingConnect.reject(new Error("Client initiated disconnect"));
    await stopping;

    // start() resolves rather than rejecting (it is not awaited by the caller,
    // so a rejection would be unhandled).
    await expect(started).resolves.toBeUndefined();
    expect(capturedStates.at(-1)).toEqual({ state: "stopped" });
    expect(capturedStates.some((st) => st.state === "error")).toBe(false);
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

    let participants: RemoteParticipant[] = [
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

    // At this point there should be ~~no~~ publishers
    // We do have publisher now, since we do not filter for publishers anymore (to also have participants with only data tracks)
    // The filtering we do is just based on the matrixRTC member events.
    expect(observedParticipants.pop()!.length).toEqual(4);

    participants = [
      mockRemoteParticipant({ identity: "@alice:example.org:DEV000" }),
      mockRemoteParticipant({ identity: "@bob:example.org:DEV111" }),
      mockRemoteParticipant({ identity: "@carol:example.org:DEV222" }),
      mockRemoteParticipant({ identity: "@dan:example.org:DEV333" }),
    ];
    participants.forEach((p) =>
      fakeLivekitRoom.emit(RoomEvent.ParticipantConnected, p),
    );

    // At this point there should be no publishers
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

describe("remote track logging", () => {
  it("logs remote participant and track events on the connection logger", () => {
    setupTest();
    const info = vi.fn();
    const warn = vi.fn();
    const testLogger = {
      getChild: (): unknown => testLogger,
      info,
      debug: vi.fn(),
      warn,
      error: vi.fn(),
    } as unknown as Logger;
    new Connection(connectionOpts(), testLogger);
    info.mockClear(); // drop the constructor log line

    const bob = mockRemoteParticipant({
      identity: "@bob:example.org:DEV111",
      sid: "PA_bob",
    });
    const pub = {
      kind: "audio",
      source: "microphone",
      trackSid: "TR_mic",
      isMuted: false,
      isEncrypted: true,
    } as unknown as RemoteTrackPublication;
    const messages = (): string[] => info.mock.calls.map((c) => c[0] as string);

    fakeLivekitRoom.emit(RoomEvent.ParticipantConnected, bob);
    fakeLivekitRoom.emit(
      RoomEvent.TrackSubscribed,
      {} as RemoteTrack,
      pub,
      bob,
    );
    fakeLivekitRoom.emit(RoomEvent.TrackMuted, pub, bob);
    fakeLivekitRoom.emit(
      RoomEvent.TrackStreamStateChanged,
      pub,
      Track.StreamState.Paused,
      bob,
    );
    expect(messages()).toEqual([
      "Participant connected: @bob:example.org:DEV111 (PA_bob)",
      "Subscribed: audio microphone TR_mic of @bob:example.org:DEV111 encrypted=true muted=false",
      "Muted: audio microphone TR_mic of @bob:example.org:DEV111 encrypted=true",
      "Stream paused: audio microphone TR_mic of @bob:example.org:DEV111 encrypted=true",
    ]);

    // Encryption status changes are logged; cryptor errors are warnings
    fakeLivekitRoom.emit(
      RoomEvent.ParticipantEncryptionStatusChanged,
      false,
      bob,
    );
    expect(messages().at(-1)).toBe(
      "Encryption status of @bob:example.org:DEV111: encrypted=false",
    );
    const cryptorError = new Error("missing key at index 3");
    fakeLivekitRoom.emit(RoomEvent.EncryptionError, cryptorError, bob);
    expect(warn).toHaveBeenCalledWith(
      "Encryption error for @bob:example.org:DEV111:",
      cryptorError,
    );

    // Local mute events are already logged by the Publisher
    fakeLivekitRoom.emit(RoomEvent.TrackMuted, pub, {
      ...fakeLocalParticipant,
      isLocal: true,
    } as unknown as LocalParticipant);
    expect(messages().filter((m) => m.startsWith("Muted"))).toHaveLength(1);

    // Listeners are removed when the scope ends
    testScope.end();
    fakeLivekitRoom.emit(RoomEvent.ParticipantDisconnected, bob);
    expect(
      messages().filter((m) => m.startsWith("Participant disconnected")),
    ).toHaveLength(0);
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
