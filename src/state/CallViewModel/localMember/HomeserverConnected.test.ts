/*
Copyright 2025 Element Creations Ltd.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { ClientEvent, SyncState } from "matrix-js-sdk";
import { MembershipManagerEvent, Status } from "matrix-js-sdk/lib/matrixrtc";

import { ObservableScope } from "../../ObservableScope";
import { createHomeserverConnected$ } from "./HomeserverConnected";

/**
 * Minimal stub of a Matrix client sufficient for our tests:
 ```
  createHomeserverConnected$(
     scope: ObservableScope,
     client: NodeStyleEventEmitter & Pick<MatrixClient, "getSyncState">,
     matrixRTCSession: NodeStyleEventEmitter &
       Pick<MatrixRTCSession, "membershipStatus" | "probablyLeft">,
 )
 ```
 */
class MockMatrixClient extends EventEmitter {
  private syncState: SyncState;
  public constructor(initial: SyncState) {
    super();
    this.syncState = initial;
  }
  public setSyncState(state: SyncState): void {
    this.syncState = state;
    // Matrix's Sync event in createHomeserverConnected$ expects [SyncState]
    this.emit(ClientEvent.Sync, [state]);
  }
  public getSyncState(): SyncState {
    return this.syncState;
  }
}

/**
 * Minimal stub of MatrixRTCSession (membership manager):
 ```
  createHomeserverConnected$(
     scope: ObservableScope,
     client: NodeStyleEventEmitter & Pick<MatrixClient, "getSyncState">,
     matrixRTCSession: NodeStyleEventEmitter &
       Pick<MatrixRTCSession, "membershipStatus" | "probablyLeft">,
 )
 ```
 */
class MockMatrixRTCSession extends EventEmitter {
  public membershipStatus: Status;
  public probablyLeft: boolean;

  public constructor(props: {
    membershipStatus: Status;
    probablyLeft: boolean;
  }) {
    super();
    this.membershipStatus = props.membershipStatus;
    this.probablyLeft = props.probablyLeft;
  }

  public setMembershipStatus(status: Status): void {
    this.membershipStatus = status;
    this.emit(MembershipManagerEvent.StatusChanged);
  }

  public setProbablyLeft(flag: boolean): void {
    this.probablyLeft = flag;
    this.emit(MembershipManagerEvent.ProbablyLeft);
  }
}

describe("createHomeserverConnected$", () => {
  let scope: ObservableScope;
  let client: MockMatrixClient;
  let session: MockMatrixRTCSession;

  beforeEach(() => {
    scope = new ObservableScope();
    client = new MockMatrixClient(SyncState.Error); // start disconnected
    session = new MockMatrixRTCSession({
      membershipStatus: Status.Disconnected,
      probablyLeft: false,
    });
  });

  afterEach(() => {
    scope.end();
  });

  // LLM generated test cases. They are a bit overkill but I improved the mocking so it is
  // easy enough to read them so I think they can stay.
  it("is false when sync state is not Syncing", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session);
    expect(hsConnected.combined$.value).toBe(false);
  });

  it("remains false while membership status is not Connected even if sync is Syncing", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session);
    client.setSyncState(SyncState.Syncing);
    expect(hsConnected.combined$.value).toBe(false); // membership still disconnected
  });

  it("is false when membership status transitions to Connected but ProbablyLeft is true", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session);
    // Make sync loop OK
    client.setSyncState(SyncState.Syncing);
    // Indicate probable leave before connection
    session.setProbablyLeft(true);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toBe(false);
  });

  it("becomes true only when all three conditions are satisfied", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session);
    // 1. Sync loop connected
    client.setSyncState(SyncState.Syncing);
    expect(hsConnected.combined$.value).toBe(false); // not yet membership connected
    // 2. Membership connected
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toBe(true); // probablyLeft is false
  });

  it("drops back to false when sync loop leaves Syncing", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session);
    // Reach connected state
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toBe(true);

    // Sync loop error => should flip false
    client.setSyncState(SyncState.Error);
    expect(hsConnected.combined$.value).toBe(false);
  });

  it("drops back to false when membership status becomes disconnected", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session);
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toBe(true);

    session.setMembershipStatus(Status.Disconnected);
    expect(hsConnected.combined$.value).toBe(false);
  });

  it("drops to false when ProbablyLeft is emitted after being true", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session);
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toBe(true);

    session.setProbablyLeft(true);
    expect(hsConnected.combined$.value).toBe(false);
  });

  it("recovers to true if ProbablyLeft becomes false again while other conditions remain true", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session);
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toBe(true);

    session.setProbablyLeft(true);
    expect(hsConnected.combined$.value).toBe(false);

    // Simulate clearing the flag (in realistic scenario membership manager would update)
    session.setProbablyLeft(false);
    expect(hsConnected.combined$.value).toBe(true);
  });

  it("composite sequence reflects each individual failure reason", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session);

    // Initially false (sync error + disconnected + not probably left)
    expect(hsConnected.combined$.value).toBe(false);

    // Fix sync only
    client.setSyncState(SyncState.Syncing);
    expect(hsConnected.combined$.value).toBe(false);

    // Fix membership
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toBe(true);

    // Introduce probablyLeft -> false
    session.setProbablyLeft(true);
    expect(hsConnected.combined$.value).toBe(false);

    // Restore notProbablyLeft -> true again
    session.setProbablyLeft(false);
    expect(hsConnected.combined$.value).toBe(true);

    // Drop sync -> false
    client.setSyncState(SyncState.Error);
    expect(hsConnected.combined$.value).toBe(false);
  });
});
