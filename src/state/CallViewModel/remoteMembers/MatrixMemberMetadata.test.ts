/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, vi } from "vitest";
import {
  type MatrixEvent,
  type RoomMember,
  type RoomState,
  RoomStateEvent,
} from "matrix-js-sdk";
import EventEmitter from "events";
import { it } from "vitest";

import { ObservableScope } from "../../ObservableScope.ts";
import type { Room as MatrixRoom } from "matrix-js-sdk/lib/models/room";
import {
  mockCallMembership,
  mockMatrixRoomMember,
  withTestScheduler,
} from "../../../utils/test.ts";
import {
  createMatrixMemberMetadata$,
  createRoomMembers$,
} from "./MatrixMemberMetadata.ts";
let testScope: ObservableScope;
let mockMatrixRoom: MatrixRoom;

describe("MatrixMemberMetadata", () => {
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
      getMembers: vi.fn().mockImplementation(() => {
        const members = Array.from(fakeMembersMap.values());
        return members;
      }),
      getMembersWithMembership: vi.fn().mockImplementation(() => {
        const members = Array.from(fakeMembersMap.values());
        return members;
      }),
    } as unknown as MatrixRoom;
  });

  function fakeMemberWith(data: Partial<RoomMember>): void {
    const userId = data.userId || "@alice:example.com";
    const member: Partial<RoomMember> = {
      userId: userId,
      rawDisplayName: data.rawDisplayName ?? userId,
      getMxcAvatarUrl:
        data.getMxcAvatarUrl ||
        vi.fn().mockImplementation(() => {
          return `mxc://example.com/${userId}`;
        }),
      ...data,
    } as unknown as RoomMember;
    fakeMembersMap.set(userId, member);
  }

  afterEach(() => {
    fakeMembersMap.clear();
  });

  describe("displayname", () => {
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

    it("should show our own user if present in rtc session and room", () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        fakeMemberWith({
          userId: "@local:example.com",
          rawDisplayName: "it's a me",
        });
        const memberships$ = behavior("a", {
          a: [mockCallMembership("@local:example.com", "DEVICE1")],
        });
        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );
        const dn$ =
          metadataStore.createDisplayNameBehavior$("@local:example.com");

        expectObservable(dn$).toBe("a", {
          a: "it's a me",
        });
        expectObservable(metadataStore.displaynameMap$).toBe("a", {
          a: new Map<string, string>([["@local:example.com", "it's a me"]]),
        });
      });
    });

    function setUpBasicRoom(): void {
      fakeMemberWith({
        userId: "@local:example.com",
        rawDisplayName: "it's a me",
      });
      fakeMemberWith({ userId: "@alice:example.com", rawDisplayName: "Alice" });
      fakeMemberWith({ userId: "@bob:example.com", rawDisplayName: "Bob" });
      fakeMemberWith({ userId: "@carl:example.com", rawDisplayName: "Carl" });
      fakeMemberWith({ userId: "@evil:example.com", rawDisplayName: "Carl" });
      fakeMemberWith({ userId: "@bob:foo.bar", rawDisplayName: "Bob" });
      fakeMemberWith({ userId: "@no-name:foo.bar" });
    }

    it("should get displayName for users", () => {
      setUpBasicRoom();

      withTestScheduler(({ behavior, expectObservable }) => {
        const memberships$ = behavior("a", {
          a: [
            mockCallMembership("@alice:example.com", "DEVICE1"),
            mockCallMembership("@bob:example.com", "DEVICE1"),
          ],
        });
        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );
        const aliceDispName$ =
          metadataStore.createDisplayNameBehavior$("@alice:example.com");

        expectObservable(aliceDispName$).toBe("a", {
          a: "Alice",
        });

        expectObservable(metadataStore.displaynameMap$).toBe("a", {
          a: new Map<string, string>([
            ["@alice:example.com", "Alice"],
            ["@bob:example.com", "Bob"],
          ]),
        });
      });
    });

    it("should use userId if no display name", () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        setUpBasicRoom();

        const memberships$ = behavior("a", {
          a: [mockCallMembership("@no-name:foo.bar", "D000")],
        });
        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );

        expectObservable(metadataStore.displaynameMap$).toBe("a", {
          a: new Map<string, string>([
            ["@no-name:foo.bar", "@no-name:foo.bar"],
          ]),
        });
      });
    });

    it("should disambiguate users with same display name", () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        setUpBasicRoom();

        const memberships$ = behavior("a", {
          a: [
            mockCallMembership("@bob:example.com", "DEVICE1"),
            mockCallMembership("@bob:example.com", "DEVICE2"),
            mockCallMembership("@bob:foo.bar", "BOB000"),
            mockCallMembership("@carl:example.com", "C000"),
            mockCallMembership("@evil:example.com", "E000"),
          ],
        });

        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );

        expectObservable(metadataStore.displaynameMap$).toBe("a", {
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

    it("should start to disambiguate reactivly when needed", () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        setUpBasicRoom();

        const memberships$ = behavior("ab", {
          a: [mockCallMembership("@bob:example.com", "DEVICE1")],
          b: [
            mockCallMembership("@bob:example.com", "DEVICE1"),
            mockCallMembership("@bob:foo.bar", "BOB000"),
          ],
        });

        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );

        expectObservable(metadataStore.displaynameMap$).toBe("ab", {
          a: new Map<string, string>([["@bob:example.com", "Bob"]]),
          b: new Map<string, string>([
            ["@bob:example.com", "Bob (@bob:example.com)"],
            ["@bob:foo.bar", "Bob (@bob:foo.bar)"],
          ]),
        });
      });
    });

    it("should keep disambiguated name when other leave", () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        setUpBasicRoom();

        const memberships$ = behavior("ab", {
          a: [
            mockCallMembership("@bob:example.com", "DEVICE1"),
            mockCallMembership("@bob:foo.bar", "BOB000"),
          ],
          b: [mockCallMembership("@bob:example.com", "DEVICE1")],
        });

        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );

        expectObservable(metadataStore.displaynameMap$).toBe("ab", {
          a: new Map<string, string>([
            ["@bob:example.com", "Bob (@bob:example.com)"],
            ["@bob:foo.bar", "Bob (@bob:foo.bar)"],
          ]),
          b: new Map<string, string>([
            ["@bob:example.com", "Bob (@bob:example.com)"],
          ]),
        });
      });
    });

    it("should disambiguate on name change", () => {
      withTestScheduler(({ behavior, schedule, expectObservable }) => {
        setUpBasicRoom();

        const memberships$ = behavior("a", {
          a: [
            mockCallMembership("@bob:example.com", "B000"),
            mockCallMembership("@carl:example.com", "C000"),
          ],
        });
        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );

        schedule("-a", {
          a: () => {
            updateDisplayName("@carl:example.com", "Bob");
          },
        });

        expectObservable(metadataStore.displaynameMap$).toBe("ab", {
          a: new Map<string, string>([
            ["@bob:example.com", "Bob"],
            ["@carl:example.com", "Carl"],
          ]),
          b: new Map<string, string>([
            ["@bob:example.com", "Bob (@bob:example.com)"],
            ["@carl:example.com", "Bob (@carl:example.com)"],
          ]),
        });
      });
    });

    it("should track individual member id with createDisplayNameBehavior", () => {
      withTestScheduler(({ behavior, schedule, expectObservable }) => {
        setUpBasicRoom();
        const BOB = "@bob:example.com";
        const CARL = "@carl:example.com";
        // for this test we build a mock environment that does all possible changes:
        // - memberships join/leave
        // - room join/leave
        // - disambiguate
        const memberships$ = behavior("ab-d", {
          a: [mockCallMembership(CARL, "C000")],
          b: [
            mockCallMembership(CARL, "C000"),
            // bob joins
            mockCallMembership(BOB, "B000"),
          ],
          // c carl gets renamed to BOB
          d: [
            // carl leaves
            mockCallMembership(BOB, "B000"),
          ],
        });
        schedule("--a-", {
          a: () => {
            // carl renames
            updateDisplayName(CARL, "Bob");
          },
        });

        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );

        const bob$ = metadataStore.createDisplayNameBehavior$(BOB);
        const carl$ = metadataStore.createDisplayNameBehavior$(CARL);

        expectObservable(bob$).toBe("abc-", {
          a: undefined,
          b: "Bob",
          c: "Bob (@bob:example.com)",
          // bob stays disambiguate even though carl left
          // d: "Bob (@bob:example.com)",
        });

        expectObservable(carl$).toBe("a-cd", {
          a: "Carl",
          // b: "Carl",
          // carl gets renamed and disambiguate
          c: "Bob (@carl:example.com)",
          d: undefined,
        });
      });
    });

    it("should disambiguate users with invisible characters", () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        const bobRtcMember = mockCallMembership("@bob:example.org", "BBBB");
        const bobZeroWidthSpaceRtcMember = mockCallMembership(
          "@bob2:example.org",
          "BBBB",
        );
        const bob = mockMatrixRoomMember(bobRtcMember, {
          rawDisplayName: "Bob",
        });
        const bobZeroWidthSpace = mockMatrixRoomMember(
          bobZeroWidthSpaceRtcMember,
          {
            rawDisplayName: "Bo\u200bb",
          },
        );
        fakeMemberWith(bob);
        fakeMemberWith(bobZeroWidthSpace);
        fakeMemberWith({ userId: "@carol:example.org" });
        const memberships$ = behavior("ab", {
          a: [mockCallMembership("@carol:example.org", "1111"), bobRtcMember],
          b: [
            mockCallMembership("@carol:example.org", "1111"),
            bobRtcMember,
            bobZeroWidthSpaceRtcMember,
          ],
        });

        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );

        const bob$ =
          metadataStore.createDisplayNameBehavior$("@bob:example.org");
        const bob2$ =
          metadataStore.createDisplayNameBehavior$("@bob2:example.org");
        const carol$ =
          metadataStore.createDisplayNameBehavior$("@carol:example.org");
        expectObservable(bob$).toBe("ab", {
          a: "Bob",
          b: "Bob (@bob:example.org)",
        });
        expectObservable(bob2$).toBe("ab", {
          a: undefined,
          b: "Bo\u200bb (@bob2:example.org)",
        });
        expectObservable(carol$).toBe("a-", {
          a: "@carol:example.org",
        });

        expectObservable(metadataStore.displaynameMap$).toBe("ab", {
          // Carol has no displayname - So userId is used.
          a: new Map([
            ["@carol:example.org", "@carol:example.org"],
            ["@bob:example.org", "Bob"],
          ]),
          // Other Bob joins, and should handle zero width hacks.
          b: new Map([
            ["@carol:example.org", "@carol:example.org"],
            [bobRtcMember.userId, `Bob (@bob:example.org)`],
            [
              bobZeroWidthSpace.userId,
              `${bobZeroWidthSpace.rawDisplayName} (${bobZeroWidthSpace.userId})`,
            ],
          ]),
        });
      });
    });

    it("should strip RTL characters from displayname", () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        const daveRtcMember = mockCallMembership("@dave:example.org", "DDDD");
        const daveRTLRtcMember = mockCallMembership(
          "@dave2:example.org",
          "DDDD",
        );
        const dave = mockMatrixRoomMember(daveRtcMember, {
          rawDisplayName: "Dave",
        });
        const daveRTL = mockMatrixRoomMember(daveRTLRtcMember, {
          rawDisplayName: "\u202eevaD",
        });

        fakeMemberWith({ userId: "@carol:example.org" });
        fakeMemberWith(daveRTL);
        fakeMemberWith(dave);
        const memberships$ = behavior("ab", {
          a: [mockCallMembership("@carol:example.org", "DDDD")],
          b: [
            mockCallMembership("@carol:example.org", "DDDD"),
            daveRtcMember,
            daveRTLRtcMember,
          ],
        });

        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );

        expectObservable(metadataStore.displaynameMap$).toBe("ab", {
          // Carol has no displayname - So userId is used.
          a: new Map([["@carol:example.org", "@carol:example.org"]]),
          // Both Dave's join. Since after stripping
          b: new Map([
            ["@carol:example.org", "@carol:example.org"],
            // Not disambiguated
            ["@dave:example.org", "Dave"],
            // This one is, since it's using RTL.
            ["@dave2:example.org", "evaD (@dave2:example.org)"],
          ]),
        });
      });
    });
  });

  describe("avatarUrl", () => {
    function updateAvatarUrl(
      userId: `@${string}:${string}`,
      avatarUrl: string,
    ): void {
      const member = fakeMembersMap.get(userId);
      if (member) {
        member.getMxcAvatarUrl = vi.fn().mockReturnValue(avatarUrl);
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

    it("should use avatar url from room members", () => {
      withTestScheduler(({ behavior, expectObservable }) => {
        fakeMemberWith({
          userId: "@local:example.com",
        });
        fakeMemberWith({
          userId: "@alice:example.com",
          getMxcAvatarUrl: vi.fn().mockReturnValue("mxc://custom.url/avatar"),
        });
        const memberships$ = behavior("a", {
          a: [
            mockCallMembership("@local:example.com", "DEVICE1"),
            mockCallMembership("@alice:example.com", "DEVICE1"),
          ],
        });
        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );
        const local$ =
          metadataStore.createAvatarUrlBehavior$("@local:example.com");

        const alice$ =
          metadataStore.createAvatarUrlBehavior$("@alice:example.com");

        expectObservable(local$).toBe("a", {
          a: "mxc://example.com/@local:example.com",
        });
        expectObservable(alice$).toBe("a", {
          a: "mxc://custom.url/avatar",
        });
        expectObservable(metadataStore.avatarMap$).toBe("a", {
          a: new Map<string, string>([
            ["@local:example.com", "mxc://example.com/@local:example.com"],
            ["@alice:example.com", "mxc://custom.url/avatar"],
          ]),
        });
      });
    });

    it("should update on avatar change and user join/leave", () => {
      withTestScheduler(({ behavior, schedule, expectObservable }) => {
        fakeMemberWith({ userId: "@carl:example.com" });
        fakeMemberWith({ userId: "@bob:example.com" });
        const memberships$ = behavior("ab-d", {
          a: [mockCallMembership("@bob:example.com", "B000")],
          b: [
            mockCallMembership("@bob:example.com", "B000"),
            mockCallMembership("@carl:example.com", "C000"),
          ],
          d: [mockCallMembership("@carl:example.com", "C000")],
        });

        const metadataStore = createMatrixMemberMetadata$(
          testScope,
          memberships$,
          createRoomMembers$(testScope, mockMatrixRoom),
        );

        schedule("--c-", {
          c: () => {
            updateAvatarUrl(
              "@carl:example.com",
              "mxc://updated.me/updatedAvatar",
            );
          },
        });

        const bob$ = metadataStore.createAvatarUrlBehavior$("@bob:example.com");
        const carl$ =
          metadataStore.createAvatarUrlBehavior$("@carl:example.com");
        expectObservable(bob$).toBe("a---", {
          a: "mxc://example.com/@bob:example.com",
        });
        expectObservable(carl$).toBe("a-c-", {
          a: "mxc://example.com/@carl:example.com",

          c: "mxc://updated.me/updatedAvatar",
        });
        expectObservable(metadataStore.avatarMap$).toBe("a-c-", {
          a: new Map<string, string>([
            ["@bob:example.com", "mxc://example.com/@bob:example.com"],
            ["@carl:example.com", "mxc://example.com/@carl:example.com"],
          ]),
          // expect an update once we update the avatar URL
          c: new Map<string, string>([
            ["@bob:example.com", "mxc://example.com/@bob:example.com"],
            ["@carl:example.com", "mxc://updated.me/updatedAvatar"],
          ]),
        });
      });
    });
  });
});
