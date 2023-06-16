/*
Copyright 2022 New Vector Ltd

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

import React from "react";
import { PressEvent } from "@react-types/shared";
import { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { UserMenuContainer } from "../UserMenuContainer";
import { Button, CopyButton } from "../button";
import { getRoomUrl } from "../matrix-utils";
import { Body, Link } from "../typography/Typography";
import { useLocationNavigation } from "../useLocationNavigation";
import styles from "./LobbyView.module.css";
import { MatrixInfo, VideoPreview } from "./VideoPreview";
import { useLocalMediaTracks } from "../livekit/useLocalMedia";
import {
  LocalUserChoices,
  MediaDevicesList,
} from "../livekit/useMediaDevicesChoices";

interface Props {
  matrixInfo: MatrixInfo;
  mediaDevices: MediaDevicesList;
  userChoices: LocalUserChoices;
  onEnter: (e: PressEvent) => void;
  isEmbedded: boolean;
  hideHeader: boolean;
}

export function LobbyView(props: Props) {
  const { t } = useTranslation();
  useLocationNavigation();

  const mediaTracks = useLocalMediaTracks(props.userChoices);

  const joinCallButtonRef = useRef<HTMLButtonElement>();
  useEffect(() => {
    if (joinCallButtonRef.current) {
      joinCallButtonRef.current.focus();
    }
  }, [joinCallButtonRef]);
  return (
    <div className={styles.room}>
      {!props.hideHeader && (
        <Header>
          <LeftNav>
            <RoomHeaderInfo
              roomName={props.matrixInfo.roomName}
              avatarUrl={props.matrixInfo.avatarUrl}
            />
          </LeftNav>
          <RightNav>
            <UserMenuContainer />
          </RightNav>
        </Header>
      )}
      <div className={styles.joinRoom}>
        <div className={styles.joinRoomContent}>
          <VideoPreview
            matrixInfo={props.matrixInfo}
            mediaDevices={props.mediaDevices}
            mediaTracks={mediaTracks}
            userChoices={props.userChoices}
          />
          <Trans>
            <Button
              ref={joinCallButtonRef}
              className={styles.copyButton}
              size="lg"
              onPress={props.onEnter}
              data-testid="lobby_joinCall"
            >
              Join call now
            </Button>
            <Body>Or</Body>
            <CopyButton
              variant="secondaryCopy"
              value={getRoomUrl(props.matrixInfo.roomName)}
              className={styles.copyButton}
              copiedMessage={t("Call link copied")}
              data-testid="lobby_inviteLink"
            >
              Copy call link and join later
            </CopyButton>
          </Trans>
        </div>
        {!props.isEmbedded && (
          <Body className={styles.joinRoomFooter}>
            <Link color="primary" to="/">
              {t("Take me Home")}
            </Link>
          </Body>
        )}
      </div>
    </div>
  );
}
