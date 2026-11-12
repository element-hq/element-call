/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ParticipationState } from "./api";
import { toMatrixRTCError } from "./errors";
import { type MembershipState } from "./matrixrtc/LocalMembership";
import { MediaConnectionState } from "./media-backend/api";

/**
 * The membership combined with the local media connection, in priority
 * order; `left` and `failed` are absorbing. "Connected once" is tracked here
 * rather than in the membership because `connected` needs both links.
 */
export function participationState(
  previous: ParticipationState,
  membership: MembershipState,
  media: MediaConnectionState | Error,
): ParticipationState {
  if (membership.kind === "left") return { kind: "left" };
  if (previous.kind === "failed") return previous;
  if (membership.kind === "failed") return membership;
  if (media instanceof Error)
    return { kind: "failed", error: toMatrixRTCError(media) };
  if (membership.kind === "waitingForTransport") return membership;
  if (membership.kind === "joining") return { kind: "connecting" };
  const reason =
    membership.kind === "reconnecting"
      ? membership.reason
      : media === MediaConnectionState.Connected
        ? null
        : "media";
  if (reason === null) return { kind: "connected" };
  const wasConnected =
    previous.kind === "connected" || previous.kind === "reconnecting";
  return wasConnected
    ? { kind: "reconnecting", reason }
    : { kind: "connecting" };
}
