/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { MediaConnectionState } from "../api";
import { ConnectionState } from "./Connection";

const states: Record<ConnectionState, MediaConnectionState> = {
  [ConnectionState.Initialized]: MediaConnectionState.Initialized,
  [ConnectionState.FetchingConfig]: MediaConnectionState.Preparing,
  [ConnectionState.Stopped]: MediaConnectionState.Stopped,
  [ConnectionState.LivekitDisconnected]: MediaConnectionState.Disconnected,
  [ConnectionState.LivekitConnecting]: MediaConnectionState.Connecting,
  [ConnectionState.LivekitConnected]: MediaConnectionState.Connected,
  [ConnectionState.LivekitReconnecting]: MediaConnectionState.Reconnecting,
  [ConnectionState.LivekitSignalReconnecting]:
    MediaConnectionState.Reconnecting,
};

/** A connection's state as the session sees it; an error passes through. */
export function toMediaConnectionState(
  state: ConnectionState | Error,
): MediaConnectionState | Error {
  return state instanceof Error ? state : states[state];
}
