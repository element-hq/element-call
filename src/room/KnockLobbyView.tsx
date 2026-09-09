/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode } from "react";
import { type MatrixClient } from "matrix-js-sdk";

import { LobbyView } from "./LobbyView";
import { useMuteStates } from "../state/useMuteStates";
import { type LobbyJoinState } from "./LobbyJoinState";
import { type PreJoinRoomInfo } from "./preJoinRoomInfo";

interface Props {
  client: MatrixClient;
  /** What we know about the room without being in it. */
  room: PreJoinRoomInfo;
  /** The user's own name and avatar, to show in their own tile. */
  profile: { displayName: string; avatarUrl: string };
  /** How the user may get into the call, and what they may do about it. */
  joinState: LobbyJoinState;
  confineToRoom: boolean;
  hideHeader: boolean;
}

/**
 * The lobby shown while the user is outside a room they want to call in —
 * either able to ask to join, or waiting for someone to answer.
 *
 * This belongs to the app shell rather than to the call: it exists precisely
 * because there is no call to be in yet. It keeps its own mute state, which is
 * why it is a component rather than part of the page — so that the call's mute
 * state and this one are never alive at the same time, reporting over each
 * other to the host.
 */
export const KnockLobbyView: FC<Props> = ({
  client,
  room,
  profile,
  joinState,
  confineToRoom,
  hideHeader,
}): ReactNode => {
  const muteStates = useMuteStates();

  if (muteStates === null) return null;

  return (
    <LobbyView
      client={client}
      matrixInfo={{
        userId: client.getUserId() ?? "",
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        ...room,
      }}
      joinState={joinState}
      confineToRoom={confineToRoom}
      hideHeader={hideHeader}
      participantCount={null}
      muteStates={muteStates}
      onShareClick={null}
    />
  );
};
