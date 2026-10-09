/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { logger } from "matrix-js-sdk/lib/logger";
import { BehaviorSubject, type Observable, Subject, throwError } from "rxjs";

import { defaultSessionTimings } from "../config";
import { MatrixRTCError } from "../errors";
import { type HomeserverConnected } from "./HomeserverConnected";
import {
  createLocalMembership$,
  type LocalMembership,
  type PreparedTransport,
} from "./LocalMembership";
import { flushPromises, testScope } from "../utils/test";

const transport: Transport = { type: "livekit", livekit_service_url: "u" };

describe("createLocalMembership$", () => {
  it("waits for the transport, joins, and leaves on leave()", async () => {
    const { membership, homeserver, prepared$ } = setup();
    expect(membership.state$.value).toEqual({ kind: "waitingForTransport" });

    homeserver.disconnectReason$.next("membership");
    prepared$.next({ transport, canDelegateDelayedLeave: false });
    expect(membership.state$.value).toEqual({ kind: "joining" });

    homeserver.disconnectReason$.next(null);
    expect(membership.state$.value).toEqual({ kind: "joined" });

    membership.leave();
    await flushPromises();
    expect(membership.state$.value).toEqual({ kind: "left" });
  });

  it("reconnects only after it was joined once", () => {
    const { membership, homeserver, prepared$ } = setup();
    prepared$.next({ transport, canDelegateDelayedLeave: false });
    expect(membership.state$.value).toEqual({ kind: "joined" });

    homeserver.disconnectReason$.next("sync");
    expect(membership.state$.value).toEqual({
      kind: "reconnecting",
      reason: "sync",
    });
    homeserver.disconnectReason$.next("probablyLeft");
    expect(membership.state$.value).toEqual({
      kind: "reconnecting",
      reason: "probablyLeft",
    });
    homeserver.disconnectReason$.next(null);
    expect(membership.state$.value).toEqual({ kind: "joined" });
  });

  it("joins with the delegated timings and hands over each delay id where the backend can", async () => {
    const { prepared$, delayId$, joinMatrixRTC, delegate } = setup();
    prepared$.next({ transport, canDelegateDelayedLeave: true });
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
    const { prepared$, delayId$, joinMatrixRTC, delegate } = setup();
    prepared$.next({ transport, canDelegateDelayedLeave: false });
    delayId$.next("delay-1");
    await flushPromises();
    expect(joinMatrixRTC).toHaveBeenCalledWith(
      transport,
      defaultSessionTimings.delayedLeave,
    );
    expect(delegate).not.toHaveBeenCalled();
  });

  it("reports a transport that could not be prepared as failed", () => {
    const error = new MatrixRTCError("no token");
    const { membership } = setup(throwError(() => error));
    expect(membership.state$.value).toEqual({ kind: "failed", error });
  });

  it("reports the membership manager giving up as failed, and stays failed", () => {
    const { membership, homeserver, prepared$, membershipManagerError$ } =
      setup();
    prepared$.next({ transport, canDelegateDelayedLeave: false });
    membershipManagerError$.next(new Error("gave up"));
    const state = membership.state$.value;
    expect(state.kind).toBe("failed");

    homeserver.disconnectReason$.next("sync");
    homeserver.disconnectReason$.next(null);
    expect(membership.state$.value).toBe(state);
  });

  it("is left after a failure once leave() is called", () => {
    const { membership } = setup(throwError(() => new MatrixRTCError("x")));
    membership.leave();
    expect(membership.state$.value).toEqual({ kind: "left" });
  });
});

function setup(preparedTransportWithErrors$?: Observable<PreparedTransport>): {
  membership: LocalMembership;
  homeserver: FakeHomeserverConnected;
  prepared$: Subject<PreparedTransport>;
  delayId$: BehaviorSubject<string | null>;
  membershipManagerError$: Subject<unknown>;
  joinMatrixRTC: ReturnType<typeof vi.fn>;
  delegate: ReturnType<typeof vi.fn>;
} {
  const prepared$ = new Subject<PreparedTransport>();
  const homeserver = fakeHomeserverConnected();
  const delayId$ = new BehaviorSubject<string | null>(null);
  const membershipManagerError$ = new Subject<unknown>();
  const joinMatrixRTC = vi.fn();
  const delegate = vi.fn(async () => Promise.resolve());
  const membership = createLocalMembership$({
    scope: testScope(),
    delegateDelayedLeave: delegate,
    preparedTransport$: preparedTransportWithErrors$ ?? prepared$,
    homeserverConnected: homeserver,
    joinMatrixRTC,
    membershipManagerError$,
    matrixRTCSession: {
      leaveRoomSession: vi.fn(async () => Promise.resolve(true)),
    },
    delayId$,
    timings: defaultSessionTimings,
    logger,
  });
  return {
    membership,
    homeserver,
    prepared$,
    delayId$,
    membershipManagerError$,
    joinMatrixRTC,
    delegate,
  };
}

type FakeHomeserverConnected = {
  disconnectReason$: BehaviorSubject<
    HomeserverConnected["disconnectReason$"]["value"]
  >;
};

function fakeHomeserverConnected(): FakeHomeserverConnected {
  return {
    disconnectReason$: new BehaviorSubject<
      HomeserverConnected["disconnectReason$"]["value"]
    >(null),
  };
}
