/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { FC, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MatrixClient } from "matrix-js-sdk/src/matrix";
import { Button } from "@vector-im/compound-web";
import classNames from "classnames";
import { useHistory } from "react-router-dom";

import inCallStyles from "./InCallView.module.css";
import styles from "./LobbyView.module.css";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { useLocationNavigation } from "../useLocationNavigation";
import { MatrixInfo, VideoPreview } from "./VideoPreview";
import { MuteStates } from "./MuteStates";
import { InviteButton } from "../button/InviteButton";
import {
  EndCallButton,
  MicButton,
  SettingsButton,
  VideoButton,
} from "../button/Button";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useMediaQuery } from "../useMediaQuery";
import { E2eeType } from "../e2ee/e2eeType";
import { Link } from "../button/Link";

interface Props {
  client: MatrixClient;
  matrixInfo: MatrixInfo;
  muteStates: MuteStates;
  onEnter: () => void;
  enterLabel?: JSX.Element | string;
  confineToRoom: boolean;
  hideHeader: boolean;
  participantCount: number | null;
  onShareClick: (() => void) | null;
  waitingForInvite?: boolean;
}

export const LobbyView: FC<Props> = ({
  client,
  matrixInfo,
  muteStates,
  onEnter,
  enterLabel,
  confineToRoom,
  hideHeader,
  participantCount,
  onShareClick,
  waitingForInvite,
}) => {
  const { t } = useTranslation();
  useLocationNavigation();

  const onAudioPress = useCallback(
    () => muteStates.audio.setEnabled?.((e) => !e),
    [muteStates],
  );
  const onVideoPress = useCallback(
    () => muteStates.video.setEnabled?.((e) => !e),
    [muteStates],
  );

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(defaultSettingsTab);

  const openSettings = useCallback(
    () => setSettingsModalOpen(true),
    [setSettingsModalOpen],
  );
  const closeSettings = useCallback(
    () => setSettingsModalOpen(false),
    [setSettingsModalOpen],
  );

  const history = useHistory();
  const onLeaveClick = useCallback(() => history.push("/"), [history]);

  const recentsButtonInFooter = useMediaQuery("(max-height: 500px)");
  const recentsButton = !confineToRoom && (
    <Link className={styles.recents} to="/">
      {t("lobby.leave_button")}
    </Link>
  );

  // TODO: Unify this component with InCallView, so we can get slick joining
  // animations and don't have to feel bad about reusing its CSS
  return (
    <>
      <div className={classNames(styles.room, inCallStyles.inRoom)}>
        {!hideHeader && (
          <Header>
            <LeftNav>
              <RoomHeaderInfo
                id={matrixInfo.roomId}
                name={matrixInfo.roomName}
                avatarUrl={matrixInfo.roomAvatar}
                encrypted={matrixInfo.e2eeSystem.kind !== E2eeType.NONE}
                participantCount={participantCount}
              />
            </LeftNav>
            <RightNav>
              {onShareClick !== null && <InviteButton onClick={onShareClick} />}
            </RightNav>
          </Header>
        )}
        <div className={styles.content}>
          <VideoPreview matrixInfo={matrixInfo} muteStates={muteStates}>
            <Button
              className={classNames(styles.join, {
                [styles.wait]: waitingForInvite,
              })}
              size={waitingForInvite ? "sm" : "lg"}
              onClick={() => {
                if (!waitingForInvite) onEnter();
              }}
              data-testid="lobby_joinCall"
            >
              {enterLabel ?? t("lobby.join_button")}
            </Button>
          </VideoPreview>
          {!recentsButtonInFooter && recentsButton}
        </div>
        <div className={inCallStyles.footer}>
          {recentsButtonInFooter && recentsButton}
          <div className={inCallStyles.buttons}>
            <MicButton
              muted={!muteStates.audio.enabled}
              onClick={onAudioPress}
              disabled={muteStates.audio.setEnabled === null}
            />
            <VideoButton
              muted={!muteStates.video.enabled}
              onClick={onVideoPress}
              disabled={muteStates.video.setEnabled === null}
            />
            <SettingsButton onClick={openSettings} />
            {!confineToRoom && <EndCallButton onClick={onLeaveClick} />}
          </div>
        </div>
      </div>
      {client && (
        <SettingsModal
          client={client}
          open={settingsModalOpen}
          onDismiss={closeSettings}
          tab={settingsTab}
          onTabChange={setSettingsTab}
        />
      )}
    </>
  );
};
