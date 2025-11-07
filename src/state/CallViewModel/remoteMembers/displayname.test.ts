/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, test, vi } from "vitest";
import {
  type MatrixEvent,
  type RoomMember,
  type RoomState,
  RoomStateEvent,
} from "matrix-js-sdk";
import EventEmitter from "events";
import { map } from "rxjs";

import { ObservableScope, trackEpoch } from "../../ObservableScope.ts";
import type { Room as MatrixRoom } from "matrix-js-sdk/lib/models/room";
import { mockCallMembership, withTestScheduler } from "../../../utils/test.ts";
import { memberDisplaynames$ } from "./displayname.ts";

let testScope: ObservableScope;
let mockMatrixRoom: MatrixRoom;

/*
 * To be populated in the test setup.
 * Maps userId to a partial/mock RoomMember object.
 */
let fakeMembersMap: Map<string, Partial<RoomMember>>;

beforeEach(() => {
  testScope = new ObservableScope();
  fakeMembersMap = new Map<string, Partial<RoomMember>>();

  const roomEmitter = new EventEmitter();
  mockMatrixRoom = {
    on: roomEmitter.on.bind(roomEmitter),
    off: roomEmitter.off.bind(roomEmitter),
    emit: roomEmitter.emit.bind(roomEmitter),
    // addListener: roomEmitter.addListener.bind(roomEmitter),
    // removeListener: roomEmitter.removeListener.bind(roomEmitter),
    getMember: vi.fn().mockImplementation((userId: string) => {
      const member = fakeMembersMap.get(userId);
      if (member) {
        return member as RoomMember;
      }
      return null;
    }),
  } as unknown as MatrixRoom;
});

function fakeMemberWith(data: Partial<RoomMember>): void {
  const userId = data.userId || "@alice:example.com";
  const member: Partial<RoomMember> = {
    userId: userId,
    rawDisplayName: data.rawDisplayName ?? userId,
    ...data,
  } as unknown as RoomMember;
  fakeMembersMap.set(userId, member);
  // return member as RoomMember;
}

function updateDisplayName(
  userId: `@${string}:${string}`,
  newDisplayName: string,
): void {
  const member = fakeMembersMap.get(userId);
  if (member) {
    member.rawDisplayName = newDisplayName;
    // Emit the event to notify listeners
    mockMatrixRoom.emit(
      RoomStateEvent.Members,
      {} as unknown as MatrixEvent,
      {} as unknown as RoomState,
      member as RoomMember,
    );
  } else {
    throw new Error(`No member found with userId: ${userId}`);
  }
}

afterEach(() => {
  fakeMembersMap.clear();
});

// TODO this is a regression, now there the own user is not always in the map. Ask Timo if fine
test.skip("should always have our own user", () => {
  withTestScheduler(({ cold, schedule, expectObservable }) => {
    const dn$ = memberDisplaynames$(
      testScope,
      mockMatrixRoom,
      cold("a", {
        a: [],
      }).pipe(trackEpoch()),
    );

    expectObservable(dn$.pipe(map((e) => e.value))).toBe("a", {
      a: new Map<string, string>([
        ["@local:example.com", "@local:example.com"],
      ]),
    });
  });
});

function setUpBasicRoom(): void {
  fakeMemberWith({ userId: "@local:example.com", rawDisplayName: "it's a me" });
  fakeMemberWith({ userId: "@alice:example.com", rawDisplayName: "Alice" });
  fakeMemberWith({ userId: "@bob:example.com", rawDisplayName: "Bob" });
  fakeMemberWith({ userId: "@carl:example.com", rawDisplayName: "Carl" });
  fakeMemberWith({ userId: "@evil:example.com", rawDisplayName: "Carl" });
  fakeMemberWith({ userId: "@bob:foo.bar", rawDisplayName: "Bob" });
  fakeMemberWith({ userId: "@no-name:foo.bar" });
}

test("should get displayName for users", () => {
  setUpBasicRoom();

  withTestScheduler(({ cold, schedule, expectObservable }) => {
    const dn$ = memberDisplaynames$(
      testScope,
      mockMatrixRoom,
      cold("a", {
        a: [
          mockCallMembership("@alice:example.com", "DEVICE1"),
          mockCallMembership("@bob:example.com", "DEVICE1"),
        ],
      }).pipe(trackEpoch()),
    );

    expectObservable(dn$.pipe(map((e) => e.value))).toBe("a", {
      a: new Map<string, string>([
        // ["@local:example.com", "it's a me"],
        ["@alice:example.com", "Alice"],
        ["@bob:example.com", "Bob"],
      ]),
    });
  });
});

test("should use userId if no display name", () => {
  withTestScheduler(({ cold, schedule, expectObservable }) => {
    setUpBasicRoom();

    const dn$ = memberDisplaynames$(
      testScope,
      mockMatrixRoom,
      cold("a", {
        a: [mockCallMembership("@no-name:foo.bar", "D000")],
      }).pipe(trackEpoch()),
    );

    expectObservable(dn$.pipe(map((e) => e.value))).toBe("a", {
      a: new Map<string, string>([
        // ["@local:example.com", "it's a me"],
        ["@no-name:foo.bar", "@no-name:foo.bar"],
      ]),
    });
  });
});

test("should disambiguate users with same display name", () => {
  withTestScheduler(({ cold, schedule, expectObservable }) => {
    setUpBasicRoom();

    const dn$ = memberDisplaynames$(
      testScope,
      mockMatrixRoom,
      cold("a", {
        a: [
          mockCallMembership("@bob:example.com", "DEVICE1"),
          mockCallMembership("@bob:example.com", "DEVICE2"),
          mockCallMembership("@bob:foo.bar", "BOB000"),
          mockCallMembership("@carl:example.com", "C000"),
          mockCallMembership("@evil:example.com", "E000"),
        ],
      }).pipe(trackEpoch()),
    );

    expectObservable(dn$.pipe(map((e) => e.value))).toBe("a", {
      a: new Map<string, string>([
        // ["@local:example.com", "it's a me"],
        ["@bob:example.com", "Bob (@bob:example.com)"],
        ["@bob:example.com", "Bob (@bob:example.com)"],
        ["@bob:foo.bar", "Bob (@bob:foo.bar)"],
        ["@carl:example.com", "Carl (@carl:example.com)"],
        ["@evil:example.com", "Carl (@evil:example.com)"],
      ]),
    });
  });
});

test("should disambiguate when needed", () => {
  withTestScheduler(({ cold, schedule, expectObservable }) => {
    setUpBasicRoom();

    const dn$ = memberDisplaynames$(
      testScope,
      mockMatrixRoom,
      cold("ab", {
        a: [mockCallMembership("@bob:example.com", "DEVICE1")],
        b: [
          mockCallMembership("@bob:example.com", "DEVICE1"),
          mockCallMembership("@bob:foo.bar", "BOB000"),
        ],
      }).pipe(trackEpoch()),
    );

    expectObservable(dn$.pipe(map((e) => e.value))).toBe("ab", {
      a: new Map<string, string>([
        // ["@local:example.com", "it's a me"],
        ["@bob:example.com", "Bob"],
      ]),
      b: new Map<string, string>([
        // ["@local:example.com", "it's a me"],
        ["@bob:example.com", "Bob (@bob:example.com)"],
        ["@bob:foo.bar", "Bob (@bob:foo.bar)"],
      ]),
    });
  });
});

test.skip("should keep disambiguated name when other leave", () => {
  withTestScheduler(({ cold, schedule, expectObservable }) => {
    setUpBasicRoom();

    const dn$ = memberDisplaynames$(
      testScope,
      mockMatrixRoom,
      cold("ab", {
        a: [
          mockCallMembership("@bob:example.com", "DEVICE1"),
          mockCallMembership("@bob:foo.bar", "BOB000"),
        ],
        b: [mockCallMembership("@bob:example.com", "DEVICE1")],
      }).pipe(trackEpoch()),
    );

    expectObservable(dn$.pipe(map((e) => e.value))).toBe("ab", {
      a: new Map<string, string>([
        // ["@local:example.com", "it's a me"],
        ["@bob:example.com", "Bob (@bob:example.com)"],
        ["@bob:foo.bar", "Bob (@bob:foo.bar)"],
      ]),
      b: new Map<string, string>([
        // ["@local:example.com", "it's a me"],
        ["@bob:example.com", "Bob (@bob:example.com)"],
      ]),
    });
  });
});

test("should disambiguate on name change", () => {
  withTestScheduler(({ cold, schedule, expectObservable }) => {
    setUpBasicRoom();

    const dn$ = memberDisplaynames$(
      testScope,
      mockMatrixRoom,
      cold("a", {
        a: [
          mockCallMembership("@bob:example.com", "B000"),
          mockCallMembership("@carl:example.com", "C000"),
        ],
      }).pipe(trackEpoch()),
    );

    schedule("-a", {
      a: () => {
        updateDisplayName("@carl:example.com", "Bob");
      },
    });

    expectObservable(dn$.pipe(map((e) => e.value))).toBe("ab", {
      a: new Map<string, string>([
        // ["@local:example.com", "it's a me"],
        ["@bob:example.com", "Bob"],
        ["@carl:example.com", "Carl"],
      ]),
      b: new Map<string, string>([
        // ["@local:example.com", "it's a me"],
        ["@bob:example.com", "Bob (@bob:example.com)"],
        ["@carl:example.com", "Bob (@carl:example.com)"],
      ]),
    });
  });
});
