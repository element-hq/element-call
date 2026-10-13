/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ConnectionState as LivekitConnectionState } from "livekit-client";

import { MediaConnectionState } from "../api";
import { type ConnectionState } from "./Connection";

const livekitStates: Record<LivekitConnectionState, MediaConnectionState> = {
  [LivekitConnectionState.Disconnected]: MediaConnectionState.Disconnected,
  [LivekitConnectionState.Connecting]: MediaConnectionState.Connecting,
  [LivekitConnectionState.Connected]: MediaConnectionState.Connected,
  [LivekitConnectionState.Reconnecting]: MediaConnectionState.Reconnecting,
  [LivekitConnectionState.SignalReconnecting]:
    MediaConnectionState.Reconnecting,
};

/** A connection's state as the session sees it; an error passes through. */
export function toMediaConnectionState(
  state: ConnectionState,
): MediaConnectionState | Error {
  switch (state.state) {
    case "initialized":
      return MediaConnectionState.Initialized;
    case "authenticating":
      return MediaConnectionState.Preparing;
    case "authenticated":
      return livekitStates[state.livekitState];
    case "error":
      return state.error;
    case "stopped":
      return MediaConnectionState.Stopped;
  }
}
