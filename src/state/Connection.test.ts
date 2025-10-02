/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { type CallMembership, type LivekitFocus } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject } from "rxjs";
import { ConnectionState, type RemoteParticipant, type Room as LivekitRoom, RoomEvent } from "livekit-client";
import fetchMock from "fetch-mock";
import EventEmitter from "events";
import { type IOpenIDToken } from "matrix-js-sdk";

import { type ConnectionOpts, type FocusConnectionState, RemoteConnection } from "./Connection.ts";
import { ObservableScope } from "./ObservableScope.ts";
import { type OpenIDClientParts } from "../livekit/openIDSFU.ts";
import { FailToGetOpenIdToken } from "../utils/errors.ts";


let testScope: ObservableScope;

let client: MockedObject<OpenIDClientParts>;

let fakeLivekitRoom: MockedObject<LivekitRoom>;

let fakeRoomEventEmiter: EventEmitter;
let fakeMembershipsFocusMap$: BehaviorSubject<{ membership: CallMembership; focus: LivekitFocus }[]>;

const livekitFocus: LivekitFocus = {
  livekit_alias: "!roomID:example.org",
  livekit_service_url: "https://matrix-rtc.example.org/livekit/jwt",
  type: "livekit"
};

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
    getDeviceId: vi.fn().mockReturnValue("ABCDEF")
  } as unknown as OpenIDClientParts);
  fakeMembershipsFocusMap$ = new BehaviorSubject<{ membership: CallMembership; focus: LivekitFocus }[]>([]);

  fakeRoomEventEmiter = new EventEmitter();

  fakeLivekitRoom = vi.mocked<LivekitRoom>({
    connect: vi.fn(),
    disconnect: vi.fn(),
    remoteParticipants: new Map(),
    state: ConnectionState.Disconnected,
    on: fakeRoomEventEmiter.on.bind(fakeRoomEventEmiter),
    off: fakeRoomEventEmiter.off.bind(fakeRoomEventEmiter),
    addListener: fakeRoomEventEmiter.addListener.bind(fakeRoomEventEmiter),
    removeListener: fakeRoomEventEmiter.removeListener.bind(fakeRoomEventEmiter),
    removeAllListeners: fakeRoomEventEmiter.removeAllListeners.bind(fakeRoomEventEmiter)
  } as unknown as LivekitRoom);

}

function setupRemoteConnection(): RemoteConnection {

  const opts: ConnectionOpts = {
    client: client,
    focus: livekitFocus,
    membershipsFocusMap$: fakeMembershipsFocusMap$,
    scope: testScope,
    livekitRoomFactory: () => fakeLivekitRoom
  };

  fetchMock.post(`${livekitFocus.livekit_service_url}/sfu/get`,
    () => {
      return {
        status: 200,
        body:
          {
            "url": "wss://matrix-rtc.m.localhost/livekit/sfu",
            "jwt": "ATOKEN"
          }
      };
    }
  );

  fakeLivekitRoom
    .connect
    .mockResolvedValue(undefined);

  return new RemoteConnection(
    opts,
    undefined
  );
}


describe("Start connection states", () => {

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    fetchMock.reset();
  });

  it("start in initialized state", () => {
    setupTest();

    const opts: ConnectionOpts = {
      client: client,
      focus: livekitFocus,
      membershipsFocusMap$: fakeMembershipsFocusMap$,
      scope: testScope,
      livekitRoomFactory: () => fakeLivekitRoom
    };
    const connection = new RemoteConnection(
      opts,
      undefined
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
      livekitRoomFactory: () => fakeLivekitRoom
    };


    const connection = new RemoteConnection(
      opts,
      undefined
    );

    const capturedStates: FocusConnectionState[] = [];
    connection.focusedConnectionState$.subscribe((value) => {
      capturedStates.push(value);
    });


    const deferred = Promise.withResolvers<IOpenIDToken>();

    client.getOpenIdToken.mockImplementation(async (): Promise<IOpenIDToken> => {
      return await deferred.promise;
    });

    connection.start()
      .catch(() => {
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
      expect(capturedState!.focus.livekit_alias).toEqual(livekitFocus.livekit_alias);
    } else {
      expect.fail("Expected FailedToStart state but got " + capturedState?.state);
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
      livekitRoomFactory: () => fakeLivekitRoom
    };

    const connection = new RemoteConnection(
      opts,
      undefined
    );

    const capturedStates: FocusConnectionState[] = [];
    connection.focusedConnectionState$.subscribe((value) => {
      capturedStates.push(value);
    });

    const deferredSFU = Promise.withResolvers<void>();
    // mock the /sfu/get call
    fetchMock.post(`${livekitFocus.livekit_service_url}/sfu/get`,
      async () => {
        await deferredSFU.promise;
        return {
          status: 500,
          body: "Internal Server Error"
        };
      }
    );


    connection.start()
      .catch(() => {
        // expected to throw
      });

    let capturedState = capturedStates.pop();
    expect(capturedState).toBeDefined();
    expect(capturedState?.state).toEqual("FetchingConfig");

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();

    if (capturedState?.state === "FailedToStart") {
      expect(capturedState?.error.message).toContain("SFU Config fetch failed with exception Error");
      expect(capturedState?.focus.livekit_alias).toEqual(livekitFocus.livekit_alias);
    } else {
      expect.fail("Expected FailedToStart state but got " + capturedState?.state);
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
      livekitRoomFactory: () => fakeLivekitRoom
    };

    const connection = new RemoteConnection(
      opts,
      undefined
    );

    const capturedStates: FocusConnectionState[] = [];
    connection.focusedConnectionState$.subscribe((value) => {
      capturedStates.push(value);
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
              "jwt": "ATOKEN"
            }
        };
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
      });

    let capturedState = capturedStates.pop();
    expect(capturedState).toBeDefined();

    expect(capturedState?.state).toEqual("FetchingConfig");

    deferredSFU.resolve();
    await vi.runAllTimersAsync();

    capturedState = capturedStates.pop();

    if (capturedState && capturedState?.state === "FailedToStart") {
      expect(capturedState.error.message).toContain("Failed to connect to livekit");
      expect(capturedState.focus.livekit_alias).toEqual(livekitFocus.livekit_alias);
    } else {
      expect.fail("Expected FailedToStart state but got " + JSON.stringify(capturedState));
    }

  });

  it("connection states happy path", async () => {
    vi.useFakeTimers();
    setupTest();

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
    setupTest();

    const connection = setupRemoteConnection();

    await connection.start();

    let capturedState: FocusConnectionState[] = [];
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
      ConnectionState.Reconnecting
    ];
    for (const state of states) {
      fakeRoomEventEmiter.emit(RoomEvent.ConnectionStateChanged, state);
    }

    for (const state of states) {
      const s = capturedState.shift();
      expect(s?.state).toEqual("ConnectedToLkRoom");
      const connectedState = s as FocusConnectionState & { state: "ConnectedToLkRoom" };
      expect(connectedState.connectionState).toEqual(state);

      // should always have the focus info
      expect(connectedState.focus.livekit_alias).toEqual(livekitFocus.livekit_alias);
      expect(connectedState.focus.livekit_service_url).toEqual(livekitFocus.livekit_service_url);
    }

    // If the state is not ConnectedToLkRoom, no events should be relayed anymore
    await connection.stop();
    capturedState = [];
    for (const state of states) {
      fakeRoomEventEmiter.emit(RoomEvent.ConnectionStateChanged, state);
    }

    expect(capturedState.length).toEqual(0);

  });


  it("shutting down the scope should stop the connection", async () => {
    setupTest();
    vi.useFakeTimers();

    const connection = setupRemoteConnection();

    let capturedState: FocusConnectionState[] = [];
    connection.focusedConnectionState$.subscribe((value) => {
      capturedState.push(value);
    });

    await connection.start();

    const stopSpy = vi.spyOn(connection, "stop");
    testScope.end();


    expect(stopSpy).toHaveBeenCalled();
    expect(fakeLivekitRoom.disconnect).toHaveBeenCalled();

    /// Ensures that focusedConnectionState$ is bound to the scope.
    capturedState = [];
    // the subscription should be closed, and no new state should be received
    // @ts-expect-error: Accessing private field for testing purposes
    connection._focusedConnectionState$.next({ state: "Initialized" });
    // @ts-expect-error: Accessing private field for testing purposes
    connection._focusedConnectionState$.next({ state: "ConnectingToLkRoom" });

    expect(capturedState.length).toEqual(0);
  });

});


function fakeRemoteLivekitParticipant(id: string): RemoteParticipant {
  return vi.mocked<RemoteParticipant>({
    identity: id
  } as unknown as RemoteParticipant);
}

function fakeRtcMemberShip(userId: string, deviceId: string): CallMembership {
  return vi.mocked<CallMembership>({
    sender: userId,
    deviceId: deviceId,
  } as unknown as CallMembership);
}

describe("Publishing participants observations", () => {


  it("should emit the list of publishing participants", async () => {
    setupTest();

    const connection = setupRemoteConnection();

    const bobIsAPublisher = Promise.withResolvers<void>();
    const danIsAPublisher = Promise.withResolvers<void>();
    const observedPublishers: { participant: RemoteParticipant; membership: CallMembership }[][] = [];
    connection.publishingParticipants$.subscribe((publishers) => {
        observedPublishers.push(publishers);
        if (publishers.some((p) => p.participant.identity === "@bob:example.org:DEV111")) {
          bobIsAPublisher.resolve();
        }
        if (publishers.some((p) => p.participant.identity === "@dan:example.org:DEV333")) {
          danIsAPublisher.resolve();
        }
    });
    // The publishingParticipants$ observable is derived from the current members of the
    // livekitRoom and the rtc membership in order to publish the members that are publishing
    // on this connection.

    let participants: RemoteParticipant[]= [
      fakeRemoteLivekitParticipant("@alice:example.org:DEV000"),
      fakeRemoteLivekitParticipant("@bob:example.org:DEV111"),
      fakeRemoteLivekitParticipant("@carol:example.org:DEV222"),
      fakeRemoteLivekitParticipant("@dan:example.org:DEV333")
    ];

    // Let's simulate 3 members on the livekitRoom
    vi.spyOn(fakeLivekitRoom, "remoteParticipants", "get")
      .mockReturnValue(
        new Map(participants.map((p) => [p.identity, p]))
      );

    for (const participant of participants) {
      fakeRoomEventEmiter.emit(RoomEvent.ParticipantConnected, participant);
    }

    // At this point there should be no publishers
    expect(observedPublishers.pop()!.length).toEqual(0);


    const otherFocus: LivekitFocus = {
      livekit_alias: "!roomID:example.org",
      livekit_service_url: "https://other-matrix-rtc.example.org/livekit/jwt",
      type: "livekit"
    }


    const rtcMemberships = [
      // Say bob is on the same focus
      { membership: fakeRtcMemberShip("@bob:example.org", "DEV111"), focus: livekitFocus },
      // Alice and carol is on a different focus
      { membership: fakeRtcMemberShip("@alice:example.org", "DEV000"), focus: otherFocus },
      { membership: fakeRtcMemberShip("@carol:example.org", "DEV222"), focus: otherFocus },
      // NO DAVE YET
    ];
    // signal this change in rtc memberships
    fakeMembershipsFocusMap$.next(rtcMemberships);

    // We should have bob has a publisher now
    await bobIsAPublisher.promise;
    const publishers = observedPublishers.pop();
    expect(publishers?.length).toEqual(1);
    expect(publishers?.[0].participant.identity).toEqual("@bob:example.org:DEV111");

    // Now let's make dan join the rtc memberships
    rtcMemberships
      .push({ membership: fakeRtcMemberShip("@dan:example.org", "DEV333"), focus: livekitFocus });
    fakeMembershipsFocusMap$.next(rtcMemberships);

    // We should have bob and dan has publishers now
    await danIsAPublisher.promise;
    const twoPublishers = observedPublishers.pop();
    expect(twoPublishers?.length).toEqual(2);
    expect(twoPublishers?.some((p) => p.participant.identity === "@bob:example.org:DEV111")).toBeTruthy();
    expect(twoPublishers?.some((p) => p.participant.identity === "@dan:example.org:DEV333")).toBeTruthy();

    // Now let's make bob leave the livekit room
    participants = participants.filter((p) => p.identity !== "@bob:example.org:DEV111");
    vi.spyOn(fakeLivekitRoom, "remoteParticipants", "get")
      .mockReturnValue(
        new Map(participants.map((p) => [p.identity, p]))
      );
    fakeRoomEventEmiter.emit(RoomEvent.ParticipantDisconnected, fakeRemoteLivekitParticipant("@bob:example.org:DEV111"));

    const updatedPublishers = observedPublishers.pop();
    expect(updatedPublishers?.length).toEqual(1);
    expect(updatedPublishers?.some((p) => p.participant.identity === "@dan:example.org:DEV333")).toBeTruthy();
  })

});
