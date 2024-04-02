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
import classNames from "classnames";
import { MatrixClient } from "matrix-js-sdk";

import styles from "./LobbyView.module.css";
import inCallStyles from "./InCallView.module.css";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { useLocationNavigation } from "../useLocationNavigation";
import { SettingsButton } from "../button/Button";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { RoomSummary } from "./useLoadGroupCall";

interface Props {
  hideHeader: boolean;
  client: MatrixClient;
  roomSummary: RoomSummary;
}

export const WaitForInviteView: FC<Props> = ({
  hideHeader,
  client,
  roomSummary,
}) => {
  const { t } = useTranslation();
  useLocationNavigation();

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

  // TODO: Unify this component with InCallView, so we can get slick joining
  // animations and don't have to feel bad about reusing its CSS
  return (
    <>
      <div className={classNames(styles.room, inCallStyles.inRoom)}>
        {!hideHeader && (
          <Header>
            <LeftNav>
              <RoomHeaderInfo
                id={roomSummary.room_id ?? "unknown"}
                name={roomSummary.name ?? "unknown"}
                avatarUrl={roomSummary.avatar_url ?? null}
                encrypted={roomSummary.is_encrypted}
                participantCount={roomSummary.num_joined_members}
              />
            </LeftNav>
            <RightNav> </RightNav>
          </Header>
        )}
        <div className={styles.content}>
          {t("wait_for_invite.wait_message")}
        </div>
        <div className={inCallStyles.footer}>
          <div className={inCallStyles.buttons}>
            <SettingsButton onPress={openSettings} />
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
