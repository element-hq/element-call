/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { constant } from "../Behavior";
import { type BaseMediaViewModel } from "./MediaViewModel";

/**
 * Media representing a LiveKit participant that cannot be mapped to any
 * MatrixRTC member of the session.
 *
 * MSC4143 asks clients to surface such streams rather than silently ignore
 * them, because they can signal an eavesdropping or impersonation attack. We
 * therefore give them a tile, but never render their audio or video.
 *
 * There is no Matrix user behind this media, so `userId` and `displayName$`
 * carry the LiveKit identity instead, purely so that debugging output stays
 * meaningful.
 */
export interface UnknownParticipantMediaViewModel extends BaseMediaViewModel {
  type: "unknown participant";
  /**
   * The LiveKit identity under which the participant connected. Exposed for
   * debugging.
   */
  rtcBackendIdentity: string;
  /**
   * The URL of the LiveKit focus on which the participant was seen. Exposed for
   * debugging.
   */
  focusUrl: string;
}

export interface UnknownParticipantMediaInputs {
  id: string;
  rtcBackendIdentity: string;
  focusUrl: string;
}

export function createUnknownParticipantMedia({
  id,
  rtcBackendIdentity,
  focusUrl,
}: UnknownParticipantMediaInputs): UnknownParticipantMediaViewModel {
  return {
    type: "unknown participant",
    id,
    userId: rtcBackendIdentity,
    displayName$: constant(rtcBackendIdentity),
    mxcAvatarUrl$: constant(undefined),
    rtcBackendIdentity,
    focusUrl,
  };
}
