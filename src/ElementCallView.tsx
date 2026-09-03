/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode, useState } from "react";
import { type MatrixClient } from "matrix-js-sdk";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import { GroupCallView } from "./room/GroupCallView";
import { type MuteStates } from "./state/MuteStates";
import { type UrlParams } from "./UrlParams";

interface Props {
  /** The client to place the call with. */
  client: MatrixClient;
  /** The call to join. */
  rtcSession: MatrixRTCSession;
  /** The audio and video mute state to start from, and keep in step with. */
  muteStates: MuteStates;
  /**
   * Whether the user is signed in as a guest, and so should be offered the
   * chance to create an account when the call ends.
   */
  isPasswordlessUser: boolean;
  /** Whether to keep the user in this call rather than letting them navigate. */
  confineToRoom: boolean;
  /** Whether to wait for the host to ask us to join. */
  preload: UrlParams["preload"];
  /** Whether to enter the call directly, without showing the lobby first. */
  skipLobby: UrlParams["skipLobby"];
}

/**
 * A call, as a component.
 *
 * This owns being in a call, and nothing about how Element Call came to be
 * showing one: no routing, no authentication, no resolving of room aliases.
 * Those belong to whatever is hosting it — the standalone app's own shell, or
 * an application embedding Element Call directly.
 *
 * TODO: `muteStates` is still passed in, because the standalone shell shares
 * one with the lobby it shows while waiting to be let into a room. Ownership
 * moves here once that lobby has its own.
 */
export const ElementCallView: FC<Props> = ({
  client,
  rtcSession,
  muteStates,
  isPasswordlessUser,
  confineToRoom,
  preload,
  skipLobby,
}): ReactNode => {
  // Whether the user is in the call is the call's own business, not its host's.
  const [joined, setJoined] = useState(false);

  return (
    <GroupCallView
      client={client}
      rtcSession={rtcSession}
      joined={joined}
      setJoined={setJoined}
      isPasswordlessUser={isPasswordlessUser}
      confineToRoom={confineToRoom}
      preload={preload}
      skipLobby={skipLobby}
      muteStates={muteStates}
    />
  );
};
