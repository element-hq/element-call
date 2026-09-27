/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type JSX, type ReactNode } from "react";
import { type MatrixClient, type RoomSummary } from "matrix-js-sdk";
import { useTranslation } from "react-i18next";
import { CheckIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { LobbyView } from "./LobbyView";
import { E2eeType } from "../e2ee/e2eeType";
import { useMuteStates } from "../state/useMuteStates";

interface Props {
  client: MatrixClient;
  /** What we know about the room from peeking at it. */
  roomSummary: RoomSummary;
  /** The user's own name and avatar, to show in their own tile. */
  profile: { displayName: string; avatarUrl: string };
  /**
   * Asks to be let in, if the room allows it. Absent once we have asked and
   * are waiting for an answer.
   */
  knock: (() => void) | null;
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
  roomSummary,
  profile,
  knock,
  confineToRoom,
  hideHeader,
}): ReactNode => {
  const { t } = useTranslation();
  const muteStates = useMuteStates();

  if (muteStates === null) return null;

  const waitingForInvite = knock === null;
  const enterLabel: string | JSX.Element = waitingForInvite ? (
    <>
      {t("lobby.waiting_for_invite")}
      <CheckIcon />
    </>
  ) : (
    t("lobby.ask_to_join")
  );

  return (
    <LobbyView
      client={client}
      matrixInfo={{
        userId: client.getUserId() ?? "",
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        roomAlias: null,
        roomId: roomSummary.room_id,
        roomName: roomSummary.name ?? "",
        roomAvatar: roomSummary.avatar_url ?? null,
        e2eeSystem: {
          kind: roomSummary["im.nheko.summary.encryption"]
            ? E2eeType.PER_PARTICIPANT
            : E2eeType.NONE,
        },
      }}
      onEnter={(): void => knock?.()}
      enterLabel={enterLabel}
      waitingForInvite={waitingForInvite}
      confineToRoom={confineToRoom}
      hideHeader={hideHeader}
      participantCount={null}
      muteStates={muteStates}
      onShareClick={null}
    />
  );
};
