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
import { testScope, withTestScheduler } from "../../../utils/test";

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
  // Note: gracePeriodMs is set to 0 to avoid debouncing delays in tests
  it("reports syncing reason when sync state is not Syncing", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session, 0);
    expect(hsConnected.combined$.value).toEqual([false, "sync"]);
  });

  it("reports membership reason when sync is Syncing but membership is not Connected", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session, 0);
    client.setSyncState(SyncState.Syncing);
    expect(hsConnected.combined$.value).toEqual([false, "membership"]);
  });

  it("reports probablyLeft reason when membership transitions to Connected but ProbablyLeft is true", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session, 0);
    // Make sync loop OK
    client.setSyncState(SyncState.Syncing);
    // Indicate probable leave before connection
    session.setProbablyLeft(true);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toEqual([false, "probablyLeft"]);
  });

  it("becomes null (connected) only when all three conditions are satisfied", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session, 0);
    // 1. Sync loop connected
    client.setSyncState(SyncState.Syncing);
    expect(hsConnected.combined$.value).toEqual([false, "membership"]); // not yet membership connected
    // 2. Membership connected
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toEqual([true, null]); // probablyLeft is false
  });

  it("returns syncing reason when sync loop leaves Syncing", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session, 0);
    // Reach connected state
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toEqual([true, null]);

    // Sync loop error => should report syncing reason
    client.setSyncState(SyncState.Error);
    expect(hsConnected.combined$.value).toEqual([false, "sync"]);
  });

  it("returns membershipConnected reason when membership status becomes disconnected", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session, 0);
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toEqual([true, null]);

    session.setMembershipStatus(Status.Disconnected);
    expect(hsConnected.combined$.value).toEqual([false, "membership"]);
  });

  it("returns certainlyConnected reason when ProbablyLeft is emitted", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session, 0);
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toEqual([true, null]);

    session.setProbablyLeft(true);
    expect(hsConnected.combined$.value).toEqual([false, "probablyLeft"]);
  });

  it("recovers to null (connected) if ProbablyLeft becomes false again while other conditions remain true", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session, 0);
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toEqual([true, null]);

    session.setProbablyLeft(true);
    expect(hsConnected.combined$.value).toEqual([false, "probablyLeft"]);

    // Simulate clearing the flag (in realistic scenario membership manager would update)
    session.setProbablyLeft(false);
    expect(hsConnected.combined$.value).toEqual([true, null]);
  });

  it("composite sequence reflects each individual failure reason", () => {
    const hsConnected = createHomeserverConnected$(scope, client, session, 0);

    // Initially: sync error + membership disconnected → syncing wins (highest priority)
    expect(hsConnected.combined$.value).toEqual([false, "sync"]);

    // Fix sync only → membershipConnected is now the blocker
    client.setSyncState(SyncState.Syncing);
    expect(hsConnected.combined$.value).toEqual([false, "membership"]);

    // Fix membership → all conditions satisfied
    session.setMembershipStatus(Status.Connected);
    expect(hsConnected.combined$.value).toEqual([true, null]);

    // Introduce probablyLeft → certainlyConnected
    session.setProbablyLeft(true);
    expect(hsConnected.combined$.value).toEqual([false, "probablyLeft"]);

    // Restore notProbablyLeft → connected again
    session.setProbablyLeft(false);
    expect(hsConnected.combined$.value).toEqual([true, null]);

    // Drop sync → syncing reason
    client.setSyncState(SyncState.Error);
    expect(hsConnected.combined$.value).toEqual([false, "sync"]);
  });
});

describe("createHomeserverConnected$ - combined$ reason values", () => {
  let scope: ObservableScope;
  let client: MockMatrixClient;
  let session: MockMatrixRTCSession;

  beforeEach(() => {
    scope = new ObservableScope();
    // Start with sync failing and membership disconnected
    client = new MockMatrixClient(SyncState.Error);
    session = new MockMatrixRTCSession({
      membershipStatus: Status.Disconnected,
      probablyLeft: false,
    });
  });

  afterEach(() => {
    scope.end();
  });

  it("is [true, null] when all three conditions are satisfied", () => {
    const { combined$ } = createHomeserverConnected$(scope, client, session, 0);
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    expect(combined$.value).toEqual([true, null]);
  });

  it("reports syncing when sync loop is not Syncing", () => {
    const { combined$ } = createHomeserverConnected$(scope, client, session, 0);
    // client starts with SyncState.Error, membership also disconnected
    expect(combined$.value).toEqual([false, "sync"]);
  });

  it("reports membershipConnected when sync is fine but membership is not Connected", () => {
    const { combined$ } = createHomeserverConnected$(scope, client, session, 0);
    client.setSyncState(SyncState.Syncing);
    // session still Status.Disconnected
    expect(combined$.value).toEqual([false, "membership"]);
  });

  it("reports certainlyConnected when probablyLeft is true", () => {
    const { combined$ } = createHomeserverConnected$(scope, client, session, 0);
    client.setSyncState(SyncState.Syncing);
    session.setMembershipStatus(Status.Connected);
    session.setProbablyLeft(true);
    expect(combined$.value).toEqual([false, "probablyLeft"]);
  });

  it("prioritises syncing over membershipConnected when both fail", () => {
    const { combined$ } = createHomeserverConnected$(scope, client, session, 0);
    // Both sync (Error) and membership (Disconnected) are failing
    expect(combined$.value).toEqual([false, "sync"]);
  });

  it("updates reason as conditions change", () => {
    const { combined$ } = createHomeserverConnected$(scope, client, session, 0);
    // Initially: syncing fails
    expect(combined$.value).toEqual([false, "sync"]);

    // Fix sync → membershipConnected is now the blocker
    client.setSyncState(SyncState.Syncing);
    expect(combined$.value).toEqual([false, "membership"]);

    // Fix membership → probablyLeft makes certainlyConnected fail
    session.setProbablyLeft(true);
    session.setMembershipStatus(Status.Connected);
    expect(combined$.value).toEqual([false, "probablyLeft"]);

    // Clear probablyLeft → all conditions satisfied
    session.setProbablyLeft(false);
    expect(combined$.value).toEqual([true, null]);
  });
});

describe("createHomeserverConnected$ - Grace Period", () => {
  const GRACE_PERIOD = 5;

  function marbleTest(
    syncStateMarbles: string,
    expectedConnectedMarbles: string,
  ): void {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      const syncState$ = behavior(syncStateMarbles, {
        s: SyncState.Syncing,
        e: SyncState.Error,
      });
      const client = new MockMatrixClient(syncState$.value);
      schedule(syncStateMarbles, {
        s: () => client.setSyncState(SyncState.Syncing),
        e: () => client.setSyncState(SyncState.Error),
      });
      const session = new MockMatrixRTCSession({
        membershipStatus: Status.Connected,
        probablyLeft: false,
      });
      const hsConnected = createHomeserverConnected$(
        testScope(),
        client,
        session,
        GRACE_PERIOD,
      );
      expectObservable(hsConnected.combined$).toBe(expectedConnectedMarbles, {
        y: [true, null],
        n: [false, "sync"],
      });
    });
  }

  it("respects gracePeriodMs: stays true during grace period and flips false after", () => {
    // - Initial state: Everything is connected
    // - Sync error occurs -> should remain connected due to grace period
    // - After grace period, not connected
    marbleTest("se", "y-----n");
    // If the sync error takes longer to occur, it should take equally long for
    // the connection state to change
    marbleTest("s--e", "y-------n");
  });

  it("recovers immediately if sync returns during grace period", () => {
    // - Initial state: Connected
    // - Sync error occurs
    // - Sync recovers BEFORE the grace period expires
    // - Connection state remains constant
    marbleTest("se--s", "y");
  });

  it("flips to true IMMEDIATELY even if a grace period was pending", () => {
    // - Initial error: connection eventually flips to false
    // - Back to Syncing -> Must be connected immediately (synchronously)
    marbleTest("e-----s", "y----ny");
  });
});
