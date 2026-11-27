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
    getLivekitToken: vi.fn(),
    delegateDelayedLeave: vi.fn(),
  };
  /** The connections the stubbed factory handed out, with their participants to drive. */
  let connections: {
    connection: Connection;
    participants$: BehaviorSubject<RemoteParticipant[]>;
    state$: BehaviorSubject<ConnectionState>;
  }[];
  let onCsApiMissing: () => void;
  const connected: ConnectionState = {
    state: "authenticated",
    livekitState: LivekitConnectionState.Connected,
  };

  /** Stands in for the factory: connections whose state and participants the test drives. */
  function stubFactory(initialState: ConnectionState): void {
    vi.spyOn(connectionFactory, "LivekitConnectionFactory").mockImplementation(
      function (this: unknown, _client, onMissing) {
        onCsApiMissing = onMissing;
        return {
          createConnection: (
            scope: ObservableScope,
            role: auth.ConnectionRole,
            transport: UnstableLivekitTransport,
            serverName: string,
            flow: auth.AuthFlow,
          ): Connection => {
            const participants$ = new BehaviorSubject<RemoteParticipant[]>([]);
            const state$ = new BehaviorSubject<ConnectionState>(initialState);
            const connection = {
              role,
              transport,
              serverName,
              flow,
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
  // publisher.
  it.each([
    ["a JWT service that delegates", exampleTransport, 401, true],
    ["a JWT service that does not", exampleTransport, 404, false],
    ["the homeserver over the JWT service", bothTransport, 404, true],
    ["the homeserver", urlTransport, 404, true],
  ])(
    "prepares the local transport for delegation through %s",
    async (_name, transport, serviceStatus, expected) => {
      fetchMock.post(
        `${exampleServiceUrl}/delegate_delayed_leave`,
        serviceStatus,
      );

      const capabilities = await backend().prepareLocalTransport(transport);

      expect(capabilities).toEqual({ canDelegateDelayedLeave: expected });
      // Only the service that issued the publisher's token is asked.
      expect(
        fetchMock.called(`${exampleServiceUrl}/delegate_delayed_leave`),
      ).toBe(transport === exampleTransport);
      expect(connections).toHaveLength(1);
      expect(connections[0].connection.role).toBe("publisher");
      expect(connections[0].connection.transport).toEqual(transport);
      expect(connections[0].connection.serverName).toBe("example.org");
    },
  );

  it("prepares a remote SFU's transport on its homeserver, where delegation is not possible", async () => {
    // A token through the homeserver means delegation, unless the SFU is
    // another homeserver's.
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
    fetchMock.post(`${exampleServiceUrl}/delegate_delayed_leave`, 404);
    stubFactory({ state: "authenticating" });
    const preparing = backend().prepareLocalTransport(exampleTransport);
    await flushPromises();
    const error = new NoMatrix2AuthorizationService(new Error("404"));
    connections[0].state$.next({ state: "error", error });
    await expect(preparing).rejects.toBe(error);
  });

  it.each([
    ["names no JWT service", urlTransport],
    ["names no url", exampleTransport],
  ])(
    "keeps its connections where the CS API is found missing and our transport %s",
    async (_what, transport) => {
      fetchMock.post(`${exampleServiceUrl}/delegate_delayed_leave`, 404);
      await backend().prepareLocalTransport(transport);
      onCsApiMissing();
      expect(connections).toHaveLength(1);
    },
  );

  it("moves the publisher to the JWT service where the CS API is found missing", async () => {
    fetchMock.post(`${exampleServiceUrl}/delegate_delayed_leave`, 401);
    const delegate = vi.spyOn(auth, "delegateDelayedLeave").mockResolvedValue();
    stubFactory({ state: "authenticating" });

    const b = backend();
    let prepared = false;
    const preparing = b.prepareLocalTransport(bothTransport).then((c) => {
      prepared = true;
      return c;
    });
    await flushPromises();
    expect(connections).toHaveLength(1);
    expect(connections[0].connection.flow.kind).toBe("csApi");

    // The publisher's token request finds no API.
    onCsApiMissing();
    expect(connections).toHaveLength(2);
    expect(connections[1].connection.role).toBe("publisher");
    expect(connections[1].connection.transport).toEqual(bothTransport);
    expect(connections[1].connection.flow.kind).toBe("openID");

    // The replaced connection winding down is not the preparation failing.
    connections[0].state$.next({ state: "stopped" });
    await flushPromises();
    expect(prepared).toBe(false);

    connections[1].state$.next(connected);
    expect(await preparing).toEqual({ canDelegateDelayedLeave: true });
    expect(
      fetchMock.called(`${exampleServiceUrl}/delegate_delayed_leave`),
    ).toBe(true);

    await b.delegateDelayedLeave("delay-1");
    expect(delegate.mock.calls[0][0].flow).toEqual({
      kind: "openID",
      serviceUrl: exampleServiceUrl,
    });
  });

  it("delegates the leave through the flow that authenticated the publisher", async () => {
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
        flow: { kind: "csApi", url: "wss://sfu.example.org" },
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
        matrixEventId$: constant("$bob"),
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

    it("reaches a url + livekit_service_url member through the JWT service where our transport names no url", async () => {
      fetchMock.post(`${exampleServiceUrl}/delegate_delayed_leave`, 404);
      const b = backend();
      await b.prepareLocalTransport(exampleTransport);
      const media = b.mediaFor(
        testScope(),
        bob(bothTransport, [hashedId, legacyId]),
      );
      await flushPromises();
      // Bob names our JWT service, so no connection of his own, and none
      // through a client-server API our homeserver does not have
      expect(connections).toHaveLength(1);
      expect(connections[0].connection.flow.kind).toBe("openID");

      connections[0].participants$.next([
        mockRemoteParticipant({
          identity: hashedId,
          trackPublications: new Map(),
        }),
      ]);
      await flushPromises();
      expect(media.tracks$.value).toEqual([]);
    });

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
      const transports = b.connections$.value.map(({ transport }) => transport);
      expect(transports).toHaveLength(2);
      expect(transports).toEqual(
        expect.arrayContaining([bothTransport, otherTransport]),
      );

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
