/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixRTCError, type ParticipationStatus } from "../api";
import { type LocalMemberState, TransportState } from "./LocalMember";

/** The local member's state, collapsed to what a host shows. */
export function participationStatus(
  state: LocalMemberState,
  connected: boolean,
  reconnecting: boolean,
  left: boolean,
): ParticipationStatus {
  if (left) return "left";
  if (fatalError(state) !== null) return "disconnected";
  if (state === TransportState.Waiting) return "waitingForTransport";
  if (connected) return "connected";
  if (reconnecting) return "reconnecting";
  return "connecting";
}

/** The error that stops the participation, if the state holds one. */
export function fatalError(state: LocalMemberState): MatrixRTCError | null {
  if (state === TransportState.Waiting) return null;
  if (state instanceof Error) return state;
  if (state.matrix instanceof Error) return state.matrix;
  if (
    typeof state.media === "object" &&
    "connection" in state.media &&
    state.media.connection instanceof Error
  )
    return state.media.connection;
  return null;
}
