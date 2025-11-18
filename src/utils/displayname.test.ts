/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";

import { calculateDisplayName, shouldDisambiguate } from "./displayname";
import {
  alice,
  aliceDoppelganger,
  aliceDoppelgangerRtcMember,
  aliceRtcMember,
  bob,
  bobRtcMember,
  bobZeroWidthSpace,
  bobZeroWidthSpaceRtcMember,
  daveRTL,
} from "./test-fixtures";
import { mockMatrixRoom } from "./test";
import { roomToMembersMap } from "../state/CallViewModel/remoteMembers/MatrixMemberMetadata";

describe("shouldDisambiguate", () => {
  test("should not disambiguate a solo member", () => {
    const room = mockMatrixRoom({
      getMembersWithMembership: () => [],
    });
    expect(shouldDisambiguate(alice, [], roomToMembersMap(room))).toEqual(
      false,
    );
  });
  test("should not disambiguate a member with an empty displayname", () => {
    const room = mockMatrixRoom({
      getMembersWithMembership: () => [alice, aliceDoppelganger],
    });
    expect(
      shouldDisambiguate(
        { rawDisplayName: "", userId: alice.userId },
        [aliceRtcMember, aliceDoppelgangerRtcMember],
        roomToMembersMap(room),
      ),
    ).toEqual(false);
  });
  test("should disambiguate a member with RTL characters", () => {
    const room = mockMatrixRoom({ getMembersWithMembership: () => [] });
    expect(shouldDisambiguate(daveRTL, [], roomToMembersMap(room))).toEqual(
      true,
    );
  });
  test("should disambiguate a member with a matching displayname", () => {
    const room = mockMatrixRoom({
      getMembersWithMembership: () => [alice, aliceDoppelganger],
    });
    expect(
      shouldDisambiguate(
        alice,
        [aliceRtcMember, aliceDoppelgangerRtcMember],
        roomToMembersMap(room),
      ),
    ).toEqual(true);
    expect(
      shouldDisambiguate(
        aliceDoppelganger,
        [aliceRtcMember, aliceDoppelgangerRtcMember],
        roomToMembersMap(room),
      ),
    ).toEqual(true);
  });
  test("should disambiguate a member with a matching displayname with hidden spaces", () => {
    const room = mockMatrixRoom({
      getMembersWithMembership: () => [bob, bobZeroWidthSpace],
    });
    expect(
      shouldDisambiguate(
        bob,
        [bobRtcMember, bobZeroWidthSpaceRtcMember],
        roomToMembersMap(room),
      ),
    ).toEqual(true);
    expect(
      shouldDisambiguate(
        bobZeroWidthSpace,
        [bobRtcMember, bobZeroWidthSpaceRtcMember],
        roomToMembersMap(room),
      ),
    ).toEqual(true);
  });
  test.for(["Alice @foo:bar", "@foo:b", "A@foo:lice", "A @f oo: ba r"])(
    "should disambiguate a member with a displayname containing a mxid-like string '%s'",
    (rawDisplayName) => {
      const room = mockMatrixRoom({
        getMembersWithMembership: () => [alice, aliceDoppelganger],
      });
      expect(
        shouldDisambiguate(
          { rawDisplayName, userId: alice.userId },
          [],
          roomToMembersMap(room),
        ),
      ).toEqual(true);
    },
  );
});

describe("calculateDisplayName", () => {
  test.for<[{ rawDisplayName?: string; userId: string }, boolean, string]>([
    [alice, false, alice.rawDisplayName],
    [alice, true, `${alice.rawDisplayName} (${alice.userId})`],
    // Empty strings and zero width strings that are effectively empty are resolved as userIds
    [{ rawDisplayName: "", userId: alice.userId }, false, alice.userId],
    [
      { rawDisplayName: "\u200b\u200b\u200b", userId: alice.userId },
      false,
      alice.userId,
    ],
    [
      { rawDisplayName: alice.userId, userId: alice.userId },
      false,
      alice.userId,
    ],
    // Zero width strings are kept intact
    [bobZeroWidthSpace, false, bobZeroWidthSpace.rawDisplayName],
    // Directional characters are stripped.
    [daveRTL, false, daveRTL.rawDisplayName.slice(1)],
    [daveRTL, true, `${daveRTL.rawDisplayName.slice(1)} (${daveRTL.userId})`],
    // Ensure we do NOT unhomoglyth
    [{ ...alice, rawDisplayName: "alice m" }, false, "alice m"],
  ])("correctly calculates displayname", ([member, disambiguate, result]) =>
    expect(calculateDisplayName(member, disambiguate)).toEqual(result),
  );
});
