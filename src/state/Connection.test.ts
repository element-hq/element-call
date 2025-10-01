/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, vi, it, describe, type MockedObject, expect } from "vitest";
import { type CallMembership, type LivekitFocus } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject } from "rxjs";
import { type Room as LivekitRoom, RoomEvent, type RoomEventCallbacks, ConnectionState } from "livekit-client";
import fetchMock from "fetch-mock";
import EventEmitter from "events";

import { type ConnectionOpts, type FocusConnectionState, RemoteConnection } from "./Connection.ts";
import { ObservableScope } from "./ObservableScope.ts";
import { type OpenIDClientParts, type SFUConfig } from "../livekit/openIDSFU.ts";
import { FailToGetOpenIdToken } from "../utils/errors.ts";

describe("Start connection states", () => {

  let testScope: ObservableScope;

  let client: MockedObject<OpenIDClientParts>;

  let fakeLivekitRoom: MockedObject<LivekitRoom>;

  let fakeRoomEventEmiter: EventEmitter<RoomEventCallbacks>;
  let fakeMembershipsFocusMap$: BehaviorSubject<{ membership: CallMembership; focus: LivekitFocus }[]>;

  const livekitFocus : LivekitFocus = {
    livekit_alias:"!roomID:example.org",
    livekit_service_url : "https://matrix-rtc.example.org/livekit/jwt"
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    fetchMock.reset();
  })

  function setupTest(): void {
    testScope = new ObservableScope();
    client = vi.mocked<OpenIDClientParts>({
      getOpenIdToken: vi.fn().mockResolvedValue(
        {
          "access_token": "rYsmGUEwNjKgJYyeNUkZseJN",
          "token_type": "Bearer",
          "matrix_server_name": "example.org",
          "expires_in": 3600
        }
      ),
      getDeviceId: vi.fn().mockReturnValue("ABCDEF"),
    } as unknown as OpenIDClientParts);
    fakeMembershipsFocusMap$ = new BehaviorSubject<{ membership: CallMembership; focus: LivekitFocus }[]>([]);

    fakeRoomEventEmiter = new EventEmitter<RoomEventCallbacks>();

    fakeLivekitRoom = vi.mocked<LivekitRoom>({
      connect: vi.fn(),
      disconnect: vi.fn(),
      remoteParticipants: new Map(),
      state: ConnectionState.Disconnected,
      on: fakeRoomEventEmiter.on.bind(fakeRoomEventEmiter),
      off: fakeRoomEventEmiter.off.bind(fakeRoomEventEmiter),
      addListener: fakeRoomEventEmiter.addListener.bind(fakeRoomEventEmiter),
      removeListener: fakeRoomEventEmiter.removeListener.bind(fakeRoomEventEmiter),
      removeAllListeners: fakeRoomEventEmiter.removeAllListeners.bind(fakeRoomEventEmiter),
    } as unknown as LivekitRoom);

  }

  function setupRemoteConnection(): RemoteConnection {

    const opts: ConnectionOpts = {
      client: client,
      focus: livekitFocus,
      membershipsFocusMap$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    }

    fetchMock.post(`${livekitFocus.livekit_service_url}/sfu/get`,
      () => {
        return {
          status: 200,
          body:
            {
              "url": "wss://matrix-rtc.m.localhost/livekit/sfu",
              "jwt": "ATOKEN",
            },
        }
      }
    );

    fakeLivekitRoom
      .connect
      .mockResolvedValue(undefined);

    const connection = new RemoteConnection(
        opts,
        undefined,
    );
    return connection;
  }

  it("start in initialized state", () => {
    setupTest();

    const opts: ConnectionOpts = {
      client: client,
      focus: livekitFocus,
      membershipsFocusMap$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    }
    const connection = new RemoteConnection(
        opts,
        undefined,
    );

    expect(connection.focusedConnectionState$.getValue().state)
      .toEqual("Initialized");
  });

  it("fail to getOpenId token then error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts: ConnectionOpts = {
      client: client,
      focus: livekitFocus,
      membershipsFocusMap$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    }


    const connection = new RemoteConnection(
      opts,
      undefined,
    );

    let capturedState: FocusConnectionState | undefined = undefined;
    connection.focusedConnectionState$.subscribe((value) => {
      capturedState = value;
    });


    const deferred = Promise.withResolvers<SFUConfig>();

    client.getOpenIdToken.mockImplementation(async () => {
      await deferred.promise;
    })

    connection.start()
      .catch(() => {
        // expected to throw
      })

    expect(capturedState.state).toEqual("FetchingConfig");

    deferred.reject(new FailToGetOpenIdToken(new Error("Failed to get token")));

    await vi.runAllTimersAsync();

    if (capturedState.state === "FailedToStart") {
      expect(capturedState.error.message).toEqual("Something went wrong");
      expect(capturedState.focus.livekit_alias).toEqual(livekitFocus.livekit_alias);
    } else {
      expect.fail("Expected FailedToStart state but got " + capturedState.state);
    }

  });

  it("fail to get JWT token and error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts: ConnectionOpts = {
      client: client,
      focus: livekitFocus,
      membershipsFocusMap$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    }

    const connection = new RemoteConnection(
      opts,
      undefined,
    );

    let capturedState: FocusConnectionState | undefined = undefined;
    connection.focusedConnectionState$.subscribe((value) => {
      capturedState = value;
    });

    const deferredSFU = Promise.withResolvers<void>();
    // mock the /sfu/get call
    fetchMock.post(`${livekitFocus.livekit_service_url}/sfu/get`,
      async () => {
        await deferredSFU.promise;
        return {
          status: 500,
          body: "Internal Server Error",
        }
      }
    );


    connection.start()
      .catch(() => {
        // expected to throw
      })

    expect(capturedState.state).toEqual("FetchingConfig");

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    if (capturedState.state === "FailedToStart") {
      expect(capturedState.error.message).toContain("SFU Config fetch failed with exception Error");
      expect(capturedState.focus.livekit_alias).toEqual(livekitFocus.livekit_alias);
    } else {
      expect.fail("Expected FailedToStart state but got " + capturedState.state);
    }

  });


  it("fail to connect to livekit error state", async () => {
    setupTest();
    vi.useFakeTimers();

    const opts: ConnectionOpts = {
      client: client,
      focus: livekitFocus,
      membershipsFocusMap$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom,
    }

    const connection = new RemoteConnection(
      opts,
      undefined,
    );

    let capturedState: FocusConnectionState | undefined = undefined;
    connection.focusedConnectionState$.subscribe((value) => {
      capturedState = value;
    });


    const deferredSFU = Promise.withResolvers<void>();
    // mock the /sfu/get call
    fetchMock.post(`${livekitFocus.livekit_service_url}/sfu/get`,
       () => {
        return {
          status: 200,
          body:
            {
              "url": "wss://matrix-rtc.m.localhost/livekit/sfu",
              "jwt": "ATOKEN",
            },
        }
      }
    );

    fakeLivekitRoom
      .connect
      .mockImplementation(async () => {
        await deferredSFU.promise;
        throw new Error("Failed to connect to livekit");
      });

    connection.start()
      .catch(() => {
        // expected to throw
      })

    expect(capturedState.state).toEqual("FetchingConfig");

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    if (capturedState.state === "FailedToStart") {
      expect(capturedState.error.message).toContain("Failed to connect to livekit");
      expect(capturedState.focus.livekit_alias).toEqual(livekitFocus.livekit_alias);
    } else {
      expect.fail("Expected FailedToStart state but got " + capturedState.state);
    }

  });

  it("connection states happy path", async () => {
    vi.useFakeTimers();
    setupTest()

    const connection = setupRemoteConnection();

    const capturedState: FocusConnectionState[] = [];
    connection.focusedConnectionState$.subscribe((value) => {
      capturedState.push(value);
    });

    await connection.start();
    await vi.runAllTimersAsync();

    const initialState = capturedState.shift();
    expect(initialState?.state).toEqual("Initialized");
    const fetchingState = capturedState.shift();
    expect(fetchingState?.state).toEqual("FetchingConfig");
    const connectingState = capturedState.shift();
    expect(connectingState?.state).toEqual("ConnectingToLkRoom");
    const connectedState = capturedState.shift();
    expect(connectedState?.state).toEqual("ConnectedToLkRoom");

  });

  it("should relay livekit events once connected", async () => {
    vi.useFakeTimers();
    setupTest()

    const connection = setupRemoteConnection();

    await connection.start();
    await vi.runAllTimersAsync();

    const capturedState: FocusConnectionState[] = [];
    connection.focusedConnectionState$.subscribe((value) => {
      capturedState.push(value);
    });

    const states = [
      ConnectionState.Disconnected,
      ConnectionState.Connecting,
      ConnectionState.Connected,
      ConnectionState.SignalReconnecting,
      ConnectionState.Connecting,
      ConnectionState.Connected,
      ConnectionState.Reconnecting,
    ]
    for (const state of states) {
      fakeRoomEventEmiter.emit(RoomEvent.ConnectionStateChanged, state);
      await vi.runAllTimersAsync();
    }

    await vi.runAllTimersAsync();

    for (const state of states) {
      const s = capturedState.shift();
      expect(s?.state).toEqual("ConnectedToLkRoom");
      expect(s?.connectionState).toEqual(state);

      // should always have the focus info
      expect(s?.focus.livekit_alias).toEqual(livekitFocus.livekit_alias);
      expect(s?.focus.livekit_service_url).toEqual(livekitFocus.livekit_service_url);
    }

  });


})
