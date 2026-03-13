/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";
import { renderHook } from "@testing-library/react";
import { type Room } from "matrix-js-sdk";

import { useCallParticipants } from "./useCallParticipants";
import { mockRtcMembership } from "../utils/test";

function mockRoom(
  members: Record<string, { displayName: string; avatarUrl?: string }>,
): Room {
  return {
    getMember: (userId: string) => {
      const m = members[userId];
      if (!m) return null;
      return {
        userId,
        rawDisplayName: m.displayName,
        name: m.displayName,
        getMxcAvatarUrl: () => m.avatarUrl ?? null,
      };
    },
  } as unknown as Room;
}

describe("useCallParticipants", () => {
  test("returns empty array when no memberships", () => {
    const room = mockRoom({});
    const { result } = renderHook(() => useCallParticipants([], room));
    expect(result.current).toEqual([]);
  });

  test("returns participants with resolved profile data", () => {
    const room = mockRoom({
      "@alice:example.org": {
        displayName: "Alice",
        avatarUrl: "mxc://example.org/alice-avatar",
      },
      "@bob:example.org": {
        displayName: "Bob",
        avatarUrl: "mxc://example.org/bob-avatar",
      },
    });
    const memberships = [
      mockRtcMembership("@alice:example.org", "AAAA"),
      mockRtcMembership("@bob:example.org", "BBBB"),
    ];

    const { result } = renderHook(() =>
      useCallParticipants(memberships, room),
    );

    expect(result.current).toEqual([
      {
        userId: "@alice:example.org",
        displayName: "Alice",
        avatarUrl: "mxc://example.org/alice-avatar",
      },
      {
        userId: "@bob:example.org",
        displayName: "Bob",
        avatarUrl: "mxc://example.org/bob-avatar",
      },
    ]);
  });

  test("deduplicates by userId when multiple devices", () => {
    const room = mockRoom({
      "@alice:example.org": { displayName: "Alice" },
    });
    const memberships = [
      mockRtcMembership("@alice:example.org", "DEVICE1"),
      mockRtcMembership("@alice:example.org", "DEVICE2"),
    ];

    const { result } = renderHook(() =>
      useCallParticipants(memberships, room),
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].userId).toBe("@alice:example.org");
  });

  test("falls back to userId when member not found in room", () => {
    const room = mockRoom({});
    const memberships = [
      mockRtcMembership("@unknown:example.org", "XXXX"),
    ];

    const { result } = renderHook(() =>
      useCallParticipants(memberships, room),
    );

    expect(result.current).toEqual([
      {
        userId: "@unknown:example.org",
        displayName: "@unknown:example.org",
        avatarUrl: null,
      },
    ]);
  });

  test("handles null avatar URL", () => {
    const room = mockRoom({
      "@alice:example.org": { displayName: "Alice" },
    });
    const memberships = [
      mockRtcMembership("@alice:example.org", "AAAA"),
    ];

    const { result } = renderHook(() =>
      useCallParticipants(memberships, room),
    );

    expect(result.current[0].avatarUrl).toBeNull();
  });
});
