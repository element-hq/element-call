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

import { useRef, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import styles from "./LobbyView.module.css";
import { Button, CopyButton } from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { getRoomUrl } from "../matrix-utils";
import { UserMenuContainer } from "../UserMenuContainer";
import { Body, Link } from "../typography/Typography";
import { useLocationNavigation } from "../useLocationNavigation";
import { MatrixInfo, VideoPreview } from "./VideoPreview";
import { UserChoices } from "../livekit/useLiveKit";

interface Props {
  matrixInfo: MatrixInfo;

  onEnter: (userChoices: UserChoices) => void;
  isEmbedded: boolean;
  hideHeader: boolean;
  initWithMutedAudio: boolean;
}

export function LobbyView(props: Props) {
  const { t } = useTranslation();
  useLocationNavigation();

  const joinCallButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (joinCallButtonRef.current) {
      joinCallButtonRef.current.focus();
    }
  }, [joinCallButtonRef]);

  const [userChoices, setUserChoices] = useState<UserChoices | undefined>(
    undefined
  );

  return (
    <div className={styles.room}>
      {!props.hideHeader && (
        <Header>
          <LeftNav>
            <RoomHeaderInfo roomName={props.matrixInfo.roomName} />
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
            initWithMutedAudio={props.initWithMutedAudio}
            onUserChoicesChanged={setUserChoices}
          />
          <Trans>
            <Button
              ref={joinCallButtonRef}
              className={styles.copyButton}
              size="lg"
              onPress={() => props.onEnter(userChoices!)}
              data-testid="lobby_joinCall"
            >
              Join call now
            </Button>
            <Body>Or</Body>
            <CopyButton
              variant="secondaryCopy"
              value={getRoomUrl(props.matrixInfo.roomId)}
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
