/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useMemo } from "react";
import { type Room } from "matrix-js-sdk";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";

export interface CallParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Derives a deduplicated list of active call participants with their
 * profile information (display name + avatar MXC URL) from the room
 * member data.
 *
 * @param memberships - The current call memberships from MatrixRTCSession
 * @param room - The Matrix room, used to resolve member profiles
 * @returns Array of unique participants with resolved profile data
 */
export function useCallParticipants(
  memberships: CallMembership[],
  room: Room,
): CallParticipant[] {
  return useMemo(() => {
    const seen = new Set<string>();
    const participants: CallParticipant[] = [];

    for (const membership of memberships) {
      const userId = membership.userId;
      if (!userId || seen.has(userId)) continue;
      seen.add(userId);

      const member = room.getMember(userId);
      participants.push({
        userId,
        displayName: member?.rawDisplayName ?? member?.name ?? userId,
        avatarUrl: member?.getMxcAvatarUrl() ?? null,
      });
    }

    return participants;
  }, [memberships, room]);
}
