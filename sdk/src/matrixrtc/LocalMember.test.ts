/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { Status, type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { BehaviorSubject, type Observable, Subject, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { defaultSessionTimings } from "../config";
import { MatrixRTCError } from "../errors";
import {
  type LocalMediaBackend,
  MediaConnectionState,
} from "../media-backend/api";
import { type HomeserverConnected } from "./HomeserverConnected";
import {
  createLocalMembership$,
  type LocalMembership,
  type PreparedTransport,
  PublishState,
  TransportState,
} from "./LocalMember";
import { flushPromises, testScope } from "../utils/test";

const transport: Transport = { type: "livekit", livekit_service_url: "u" };

describe("createLocalMembership$", () => {
  it("waits for the transport, then reports the media connection and the join", async () => {
    const { membership, local, prepared$ } = setup();
    expect(membership.state$.value).toBe(TransportState.Waiting);

    prepared$.next({ transport, canDelegateDelayedLeave: false });
    expect(membership.state$.value).toEqual({
      media: { connection: MediaConnectionState.Initialized },
      matrix: Status.Connected,
    });

    local.connectionState$.next(MediaConnectionState.Connected);
    expect(membership.state$.value).toEqual({
      media: PublishState.WaitingForUser,
      matrix: Status.Connected,
    });

    membership.requestJoinAndPublish();
    await flushPromises();
    expect(membership.state$.value).toEqual({
      media: PublishState.Publishing,
      matrix: Status.Connected,
    });
    expect(membership.connected$.value).toBe(true);
  });

  it("publishes only while joined and the homeserver is reachable", async () => {
    const { membership, local, homeserver } = setup();
    expect(local.setPublishing).toHaveBeenLastCalledWith(false);

    membership.requestJoinAndPublish();
    expect(local.setPublishing).toHaveBeenLastCalledWith(true);

    homeserver.combined$.next([false, "sync"]);
    expect(local.setPublishing).toHaveBeenLastCalledWith(false);
    homeserver.combined$.next([true, null]);
    expect(local.setPublishing).toHaveBeenLastCalledWith(true);

    membership.requestDisconnect();
    expect(local.setPublishing).toHaveBeenLastCalledWith(false);
    // A sync outage after leaving must not bring the media back
    homeserver.combined$.next([false, "sync"]);
    homeserver.combined$.next([true, null]);
    expect(local.setPublishing).toHaveBeenLastCalledWith(false);
    await flushPromises();
  });

  it("joins with the delegated timings and hands over each delay id where the backend can", async () => {
    const { membership, prepared$, delayId$, joinMatrixRTC, delegate } =
      setup();
    prepared$.next({ transport, canDelegateDelayedLeave: true });
    membership.requestJoinAndPublish();
    await flushPromises();
    expect(joinMatrixRTC).toHaveBeenCalledWith(
      transport,
      defaultSessionTimings.delegatedDelayedLeave,
    );

    delayId$.next("delay-1");
    await flushPromises();
    expect(delegate).toHaveBeenCalledWith("delay-1");
    delayId$.next("delay-2");
    await flushPromises();
    expect(delegate).toHaveBeenLastCalledWith("delay-2");
  });

  it("never hands the leave over where the backend cannot take it", async () => {
    const { membership, prepared$, delayId$, joinMatrixRTC, delegate } =
      setup();
    prepared$.next({ transport, canDelegateDelayedLeave: false });
    membership.requestJoinAndPublish();
    delayId$.next("delay-1");
    await flushPromises();
    expect(joinMatrixRTC).toHaveBeenCalledWith(
      transport,
      defaultSessionTimings.delayedLeave,
    );
    expect(delegate).not.toHaveBeenCalled();
  });

  it("reports a transport that could not be prepared as fatal", () => {
    const error = new MatrixRTCError("no token");
    const { membership } = setup(throwError(() => error));
    expect(membership.state$.value).toBe(error);
  });

  it("reports a connection loss and a publish failure in the media state", () => {
    const { membership, local, prepared$ } = setup();
    prepared$.next({ transport, canDelegateDelayedLeave: false });
    local.connectionState$.next(MediaConnectionState.Connected);
    membership.requestJoinAndPublish();

    local.connectionState$.next(MediaConnectionState.Reconnecting);
    expect(membership.state$.value).toEqual({
      media: { connection: MediaConnectionState.Reconnecting },
      matrix: Status.Connected,
    });
    expect(membership.disconnectReason$.value).toBe("media");
    expect(membership.reconnecting$.value).toBe(true);

    const failure = new MatrixRTCError("no camera");
    local.publishError$.next(failure);
    const state = membership.state$.value;
    expect(typeof state === "object" && "media" in state && state.media).toBe(
      failure,
    );
  });
});

function setup(preparedTransportWithErrors$?: Observable<PreparedTransport>): {
  membership: LocalMembership;
  local: FakeLocalMediaBackend;
  homeserver: FakeHomeserverConnected;
  prepared$: Subject<PreparedTransport>;
  delayId$: BehaviorSubject<string | null>;
  joinMatrixRTC: ReturnType<typeof vi.fn>;
  delegate: ReturnType<typeof vi.fn>;
} {
  const prepared$ = new Subject<PreparedTransport>();
  const local = fakeLocalMediaBackend();
  const homeserver = fakeHomeserverConnected();
  const delayId$ = new BehaviorSubject<string | null>(null);
  const joinMatrixRTC = vi.fn();
  const delegate = vi.fn(async () => Promise.resolve());
  const membership = createLocalMembership$({
    scope: testScope(),
    local,
    delegateDelayedLeave: delegate,
    preparedTransport$: preparedTransportWithErrors$ ?? prepared$,
    homeserverConnected: homeserver,
    joinMatrixRTC,
    membershipManagerError$: new Subject(),
    matrixRTCSession: {
      leaveRoomSession: vi.fn(async () => Promise.resolve(true)),
    },
    delayId$,
    timings: defaultSessionTimings,
    logger,
  });
  return {
    membership,
    local,
    homeserver,
    prepared$,
    delayId$,
    joinMatrixRTC,
    delegate,
  };
}

type FakeLocalMediaBackend = Omit<
  LocalMediaBackend,
  "connectionState$" | "publishError$" | "setPublishing"
> & {
  connectionState$: BehaviorSubject<MediaConnectionState | Error>;
  publishError$: BehaviorSubject<Error | null>;
  setPublishing: ReturnType<typeof vi.fn<LocalMediaBackend["setPublishing"]>>;
};

function fakeLocalMediaBackend(): FakeLocalMediaBackend {
  return {
    connectionState$: new BehaviorSubject<MediaConnectionState | Error>(
      MediaConnectionState.Initialized,
    ),
    media$: new BehaviorSubject(null),
    setPublishing: vi.fn<LocalMediaBackend["setPublishing"]>(),
    publishError$: new BehaviorSubject<Error | null>(null),
    publish: vi.fn<LocalMediaBackend["publish"]>(),
    unpublish: vi.fn<LocalMediaBackend["unpublish"]>(),
  };
}

type FakeHomeserverConnected = Omit<HomeserverConnected, "combined$"> & {
  combined$: BehaviorSubject<HomeserverConnected["combined$"]["value"]>;
};

function fakeHomeserverConnected(): FakeHomeserverConnected {
  return {
    combined$: new BehaviorSubject<HomeserverConnected["combined$"]["value"]>([
      true,
      null,
    ]),
    rtsSession$: new BehaviorSubject(Status.Connected),
  };
}
