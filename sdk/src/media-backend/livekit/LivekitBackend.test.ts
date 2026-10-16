/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionState as LivekitConnectionState,
  type Room as LivekitRoom,
  type RemoteParticipant,
} from "livekit-client";
import fetchMock from "fetch-mock";
import { logger } from "matrix-js-sdk/lib/logger";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, NEVER } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { E2eeType } from "../../encryption";
import { MatrixRTCError, NoMatrix2AuthorizationService } from "../../errors";
import { constant } from "../../reactive/Behavior";
import { ObservableScope } from "../../reactive/ObservableScope";
import { type RTCMember } from "../../api";
import { defaultSessionTimings } from "../../config";
import {
  flushPromises,
  mockEmitter,
  ownMemberMock,
  testScope,
} from "../../utils/test";
import { MediaConnectionState } from "../api";
import * as auth from "./auth";
import { type TransportLocator } from "./auth";
import { type Connection, type ConnectionState } from "./Connection";
import * as connectionFactory from "./ConnectionFactory";
import { toMediaConnectionState } from "./connectionState";
import {
  createLivekitBackend,
  createTransportRegistry,
  supportsDelegation,
} from "./LivekitBackend";
import {
  exampleServiceUrl,
  exampleTransport,
  mockRemoteParticipant,
} from "./test";

const locator = (
  transport: UnstableLivekitTransport,
  serverName = "example.org",
): TransportLocator => ({ transport, serverName });

const otherTransport: UnstableLivekitTransport = {
  type: "livekit",
  livekit_service_url: "https://other.example.org",
};

describe("createTransportRegistry", () => {
  it("connects to a transport once however many members are on it, and drops it with the last", () => {
    const registry = createTransportRegistry(testScope());
    const transports = (): UnstableLivekitTransport[] =>
      registry.transports$.value.value.map((t) => t.transport);
    const alice = new ObservableScope();
    const bob = new ObservableScope();

    registry.follow(alice, new BehaviorSubject(locator(exampleTransport)));
    registry.follow(bob, new BehaviorSubject(locator(exampleTransport)));
    expect(transports()).toEqual([exampleTransport]);

    alice.end();
    expect(transports()).toEqual([exampleTransport]);

    bob.end();
    expect(transports()).toEqual([]);
  });

  it("follows a member that changes transport", () => {
    const registry = createTransportRegistry(testScope());
    const transport$ = new BehaviorSubject<TransportLocator | undefined>(
      locator(exampleTransport),
    );

    registry.follow(testScope(), transport$);
    transport$.next(locator(otherTransport));
    expect(registry.transports$.value.value).toEqual([locator(otherTransport)]);

    transport$.next(undefined);
    expect(registry.transports$.value.value).toEqual([]);
  });

  it("is safe to release after the registry's own scope has ended", () => {
    const scope = new ObservableScope();
    const registry = createTransportRegistry(scope);
    const member = new ObservableScope();
    registry.follow(member, new BehaviorSubject(locator(exampleTransport)));

    scope.end();
    expect(() => member.end()).not.toThrow();
  });
});

describe("supportsDelegation", () => {
  afterEach(() => fetchMock.reset());
  const endpoint = `${exampleServiceUrl}/delegate_delayed_leave`;

  it.each([
    ["anything but a 404", 401, true],
    ["a 404", 404, false],
  ])("reads %s as the answer", async (_name, status, expected) => {
    fetchMock.post(endpoint, status);
    await expect(
      supportsDelegation(endpoint, "transport", logger),
    ).resolves.toBe(expected);
  });

  it("assumes no support where the probe itself fails", async () => {
    fetchMock.post(endpoint, { throws: new TypeError("CORS") });
    await expect(
      supportsDelegation(endpoint, "transport", logger),
    ).resolves.toBe(false);
  });
});

describe("toMediaConnectionState", () => {
  it("maps every state and passes an error through", () => {
    expect(toMediaConnectionState({ state: "authenticating" })).toBe(
      MediaConnectionState.Preparing,
    );
    expect(
      toMediaConnectionState({
        state: "authenticated",
        livekitState: LivekitConnectionState.Connected,
      }),
    ).toBe(MediaConnectionState.Connected);
    expect(
      toMediaConnectionState({
        state: "authenticated",
        livekitState: LivekitConnectionState.SignalReconnecting,
      }),
    ).toBe(MediaConnectionState.Reconnecting);
    expect(toMediaConnectionState({ state: "stopped" })).toBe(
      MediaConnectionState.Stopped,
    );
    const error = new MatrixRTCError("gone");
    expect(toMediaConnectionState({ state: "error", error })).toBe(error);
  });
});

describe("createLivekitBackend", () => {
  const homeserver = "https://matrix.example.org";
  const homeserverEndpoint = `${homeserver}/_matrix/client/unstable/io.element.msc4195/rtc/livekit/delegate_delayed_leave`;
  const urlTransport: UnstableLivekitTransport = {
    type: "livekit",
    url: "wss://sfu.example.org",
  };
  const bothTransport: UnstableLivekitTransport = {
    ...urlTransport,
    ...exampleTransport,
  };
  const client = {
    baseUrl: homeserver,
    getOpenIdToken: vi.fn(),
    _unstable_getLivekitToken: vi.fn(),
    _unstable_delegateDelayedLeave: vi.fn(),
  };
  /** The connections the stubbed factory handed out, with their participants to drive. */
  let connections: {
    connection: Connection;
    participants$: BehaviorSubject<RemoteParticipant[]>;
    state$: BehaviorSubject<ConnectionState>;
  }[];
  const connected: ConnectionState = {
    state: "authenticated",
    livekitState: LivekitConnectionState.Connected,
  };

  /** Stands in for the factory: connections whose state and participants the test drives. */
  function stubFactory(initialState: ConnectionState): void {
    vi.spyOn(connectionFactory, "LivekitConnectionFactory").mockImplementation(
      function (this: unknown) {
        return {
          createConnection: (
            scope: ObservableScope,
            role: auth.ConnectionRole,
            transport: UnstableLivekitTransport,
            serverName: string,
          ): Connection => {
            const participants$ = new BehaviorSubject<RemoteParticipant[]>([]);
            const state$ = new BehaviorSubject<ConnectionState>(initialState);
            const connection = {
              role,
              transport,
              serverName,
              state$,
              remoteParticipants$: scope.behavior(participants$),
              livekitRoom: fakeLivekitRoom(),
              start: vi.fn(async () => Promise.resolve()),
              stop: vi.fn(async () => Promise.resolve()),
            } as unknown as Connection;
            connections.push({ connection, participants$, state$ });
            return connection;
          },
        } as unknown as connectionFactory.LivekitConnectionFactory;
      },
    );
  }

  beforeEach(() => {
    connections = [];
    stubFactory(connected);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fetchMock.reset();
  });

  function backend(): ReturnType<typeof createLivekitBackend> {
    return createLivekitBackend(
      testScope(),
      {
        roomId: "!room:example.org",
        slotId: "m.call#ROOM",
        ownMembershipIdentity: ownMemberMock,
        publish: [],
        encryptionSystem: { kind: E2eeType.NONE },
        mediaKeys$: NEVER,
        timings: defaultSessionTimings,
        logger,
      },
      { client },
    );
  }

  // Delegation goes through whichever service authenticates us as a
  // publisher: the JWT service wherever the transport names one, the
  // homeserver for a `url` alone
  it.each([
    ["the JWT service", exampleTransport, 404, 401, true],
    ["the JWT service, and only it", bothTransport, 401, 404, false],
    ["the homeserver", urlTransport, 401, 404, true],
    ["neither", exampleTransport, 404, 404, false],
  ])(
    "prepares the local transport and asks %s about delegation",
    async (_name, transport, homeserverStatus, serviceStatus, expected) => {
      fetchMock.post(homeserverEndpoint, homeserverStatus);
      fetchMock.post(
        `${exampleServiceUrl}/delegate_delayed_leave`,
        serviceStatus,
      );

      const capabilities = await backend().prepareLocalTransport(transport);

      expect(capabilities).toEqual({ canDelegateDelayedLeave: expected });
      expect(connections).toHaveLength(1);
      expect(connections[0].connection.role).toBe("publisher");
      expect(connections[0].connection.transport).toEqual(transport);
      expect(connections[0].connection.serverName).toBe("example.org");
    },
  );

  it("prepares a remote SFU's transport on its homeserver, where delegation is not possible", async () => {
    // Our own homeserver would delegate, so only the SFU being remote can
    // explain delegation being skipped
    fetchMock.post(homeserverEndpoint, 401);
    const remoteTransport: UnstableLivekitTransport = {
      type: "livekit",
      url: "wss://sfu.sample.com",
      server_name: "sample.com",
    };

    const capabilities = await backend().prepareLocalTransport(remoteTransport);

    expect(capabilities).toEqual({ canDelegateDelayedLeave: false });
    expect(connections[0].connection.role).toBe("publisher");
    expect(connections[0].connection.serverName).toBe("sample.com");
  });

  it("waits for the publisher connection to hold its token before the join", async () => {
    fetchMock.post(homeserverEndpoint, 404);
    fetchMock.post(`${exampleServiceUrl}/delegate_delayed_leave`, 404);
    stubFactory({ state: "authenticating" });

    let prepared = false;
    const preparing = backend()
      .prepareLocalTransport(exampleTransport)
      .then(() => (prepared = true));
    await flushPromises();
    expect(prepared).toBe(false);

    connections[0].state$.next(connected);
    await preparing;
    expect(prepared).toBe(true);
  });

  it("fails the preparation with the publisher connection's error", async () => {
    fetchMock.post(homeserverEndpoint, 404);
    fetchMock.post(`${exampleServiceUrl}/delegate_delayed_leave`, 404);
    stubFactory({ state: "authenticating" });
    const preparing = backend().prepareLocalTransport(exampleTransport);
    await flushPromises();
    const error = new NoMatrix2AuthorizationService(new Error("404"));
    connections[0].state$.next({ state: "error", error });
    await expect(preparing).rejects.toBe(error);
  });

  it("delegates the leave through the flow that authenticated the publisher", async () => {
    fetchMock.post(homeserverEndpoint, 401);
    const delegate = vi.spyOn(auth, "delegateDelayedLeave").mockResolvedValue();
    const b = backend();
    await expect(b.delegateDelayedLeave("delay-1")).rejects.toThrow(
      "No local transport",
    );

    await b.prepareLocalTransport(urlTransport);
    await b.delegateDelayedLeave("delay-1");

    expect(delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        membership: ownMemberMock,
        transport: urlTransport,
        roomId: "!room:example.org",
        slotId: "m.call#ROOM",
        delayId: "delay-1",
        delayTimeoutMs: defaultSessionTimings.delegatedDelayedLeave.delay_ms,
      }),
    );
  });

  describe("mediaFor", () => {
    // A member advertising both a `url` and a `livekit_service_url` may have
    // authenticated through either flow, so it has two candidate identities
    const legacyId = "@bob:example.org:DEV000";
    const hashedId = "2qkXfWz1S7jQmU0bJ6yN8aVtR3pLcDgHe9oZxKwMiA4";

    function bob(
      transport: UnstableLivekitTransport,
      backendIdentities: string[],
    ): RTCMember {
      return {
        local: false,
        rtcBackendIdentity: legacyId,
        backendIdentities,
        userId: "@bob:example.org",
        deviceId: "DEV000",
        memberId: legacyId,
        transport$: constant({
          type: "livekit",
          id: JSON.stringify(transport),
          raw: transport,
          resolved$: constant(undefined),
        }),
        applicationData$: constant({}),
        displayName$: constant("Bob"),
        avatarUrl$: constant(undefined),
      };
    }

    async function prepared(): Promise<
      ReturnType<typeof createLivekitBackend>
    > {
      fetchMock.post(homeserverEndpoint, 404);
      fetchMock.post(`${exampleServiceUrl}/delegate_delayed_leave`, 404);
      const b = backend();
      await b.prepareLocalTransport(bothTransport);
      return b;
    }

    it.each([
      ["legacy", legacyId],
      ["hashed", hashedId],
    ])(
      "matches a member with two candidate identities publishing under the %s one",
      async (_name, identity) => {
        const b = await prepared();
        const media = b.mediaFor(
          testScope(),
          bob(bothTransport, [hashedId, legacyId]),
        );
        await flushPromises();
        // Bob is on our transport, so his media arrives on the publisher
        // connection
        expect(connections).toHaveLength(1);
        expect(media.tracks$.value).toBeNull();

        connections[0].participants$.next([
          mockRemoteParticipant({ identity, trackPublications: new Map() }),
        ]);
        await flushPromises();
        expect(media.tracks$.value).toEqual([]);
      },
    );

    it("does not match a member with two candidate identities to anyone else", async () => {
      const b = await prepared();
      const media = b.mediaFor(
        testScope(),
        bob(bothTransport, [hashedId, legacyId]),
      );
      connections[0].participants$.next([
        mockRemoteParticipant({
          identity: "@stranger:example.org:DEV999",
          trackPublications: new Map(),
        }),
      ]);
      await flushPromises();
      expect(media.tracks$.value).toBeNull();
    });

    it("has no media for a member on another transport until it shows up there", async () => {
      const b = await prepared();
      const media = b.mediaFor(testScope(), bob(otherTransport, [legacyId]));
      await flushPromises();
      const remote = connections.find(
        (c) => c.connection.role === "subscriber",
      );
      expect(remote?.connection.transport).toEqual(otherTransport);

      // The same identity on our own transport is someone else's room
      connections[0].participants$.next([
        mockRemoteParticipant({
          identity: legacyId,
          trackPublications: new Map(),
        }),
      ]);
      await flushPromises();
      expect(media.tracks$.value).toBeNull();

      remote!.participants$.next([
        mockRemoteParticipant({
          identity: legacyId,
          trackPublications: new Map(),
        }),
      ]);
      await flushPromises();
      expect(media.tracks$.value).toEqual([]);
    });

    it("follows a member to a new transport, and drops the old connection with it", async () => {
      const b = await prepared();
      const transport$ = new BehaviorSubject(
        bob(bothTransport, [legacyId]).transport$.value,
      );
      const media = b.mediaFor(testScope(), {
        ...bob(bothTransport, [legacyId]),
        transport$,
      });
      connections[0].participants$.next([
        mockRemoteParticipant({
          identity: legacyId,
          trackPublications: new Map(),
        }),
      ]);
      await flushPromises();
      expect(media.tracks$.value).toEqual([]);

      transport$.next(bob(otherTransport, [legacyId]).transport$.value);
      await flushPromises();

      expect(media.tracks$.value).toBeNull();
      const remote = connections.find(
        (c) => c.connection.role === "subscriber",
      );
      expect(remote?.connection.transport).toEqual(otherTransport);
      expect(b.connections$.value.map(({ transport }) => transport)).toEqual([
        bothTransport,
        otherTransport,
      ]);

      transport$.next(bob(bothTransport, [legacyId]).transport$.value);
      await flushPromises();
      expect(media.tracks$.value).toEqual([]);
      expect(b.connections$.value.map(({ transport }) => transport)).toEqual([
        bothTransport,
      ]);
    });

    it("has no media for a member without a transport, and opens no connection", async () => {
      const b = await prepared();
      const media = b.mediaFor(testScope(), {
        ...bob(bothTransport, [legacyId]),
        transport$: constant(undefined),
      });
      await flushPromises();

      expect(media.tracks$.value).toBeNull();
      expect(connections).toHaveLength(1);
    });

    it("connects to a remote member's transport on the member's homeserver", async () => {
      const b = await prepared();
      const carlsTransport: UnstableLivekitTransport = {
        type: "livekit",
        url: "wss://sfu.sample.com",
      };
      b.mediaFor(testScope(), {
        ...bob(carlsTransport, ["carl-hashed"]),
        userId: "@carl:sample.com",
      });
      await flushPromises();

      const remote = connections.find(
        (c) => c.connection.role === "subscriber",
      );
      expect(remote?.connection.transport).toEqual(carlsTransport);
      expect(remote?.connection.serverName).toBe("sample.com");
    });

    it("connects to a remote publisher's transport on the SFU's homeserver", async () => {
      const b = await prepared();
      // Dave has no SFU of his own and publishes on sample.com's
      const remoteTransport: UnstableLivekitTransport = {
        type: "livekit",
        url: "wss://sfu.sample.com",
        server_name: "sample.com",
      };
      b.mediaFor(testScope(), {
        ...bob(remoteTransport, ["dave-hashed"]),
        userId: "@dave:example.org",
      });
      await flushPromises();

      const remote = connections.find(
        (c) => c.connection.role === "subscriber",
      );
      expect(remote?.connection.transport).toEqual(remoteTransport);
      expect(remote?.connection.serverName).toBe("sample.com");
    });
  });
});

/** The parts of a LiveKit room the local media and the member media read. */
function fakeLivekitRoom(): LivekitRoom {
  return {
    options: {},
    setE2EEEnabled: vi.fn(),
    localParticipant: {
      ...mockEmitter(),
      trackPublications: new Map(),
      getTrackPublication: () => undefined,
    },
    remoteParticipants: new Map(),
    ...mockEmitter(),
  } as unknown as LivekitRoom;
}
