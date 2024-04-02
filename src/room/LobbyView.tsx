/*
Copyright 2022-2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { FC, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MatrixClient } from "matrix-js-sdk/src/matrix";
import { Button, Link } from "@vector-im/compound-web";
import classNames from "classnames";
import { useHistory } from "react-router-dom";

import styles from "./LobbyView.module.css";
import inCallStyles from "./InCallView.module.css";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { useLocationNavigation } from "../useLocationNavigation";
import { MatrixInfo, VideoPreview } from "./VideoPreview";
import { MuteStates } from "./MuteStates";
import { InviteButton } from "../button/InviteButton";
import {
  HangupButton,
  MicButton,
  SettingsButton,
  VideoButton,
} from "../button/Button";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useMediaQuery } from "../useMediaQuery";
import { E2eeType } from "../e2ee/e2eeType";

interface Props {
  client: MatrixClient;
  matrixInfo: MatrixInfo;
  muteStates: MuteStates;
  onEnter: () => void;
  confineToRoom: boolean;
  hideHeader: boolean;
  participantCount: number;
  onShareClick: (() => void) | null;
}

export const LobbyView: FC<Props> = ({
  client,
  matrixInfo,
  muteStates,
  onEnter,
  confineToRoom,
  hideHeader,
  participantCount,
  onShareClick,
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
    <Link className={styles.recents} href="#" onClick={onLeaveClick}>
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
              className={styles.join}
              size="lg"
              onClick={onEnter}
              data-testid="lobby_joinCall"
            >
              {t("lobby.join_button")}
            </Button>
          </VideoPreview>
          {!recentsButtonInFooter && recentsButton}
        </div>
        <div className={inCallStyles.footer}>
          {recentsButtonInFooter && recentsButton}
          <div className={inCallStyles.buttons}>
            <MicButton
              muted={!muteStates.audio.enabled}
              onPress={onAudioPress}
              disabled={muteStates.audio.setEnabled === null}
            />
            <VideoButton
              muted={!muteStates.video.enabled}
              onPress={onVideoPress}
              disabled={muteStates.video.setEnabled === null}
            />
            <SettingsButton onPress={openSettings} />
            {!confineToRoom && <HangupButton onPress={onLeaveClick} />}
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
