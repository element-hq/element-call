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

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  ChangeEvent,
  FC,
} from "react";
import { Trans, useTranslation } from "react-i18next";

import styles from "./LobbyView.module.css";
import { Button, CopyButton } from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { getRoomUrl } from "../matrix-utils";
import { UserMenuContainer } from "../UserMenuContainer";
import { Body, Link } from "../typography/Typography";
import { useLocationNavigation } from "../useLocationNavigation";
import { MatrixInfo, VideoPreview } from "./VideoPreview";
import { E2EEConfig } from "../livekit/useLiveKit";
import { InputField } from "../input/Input";
import { useEnableE2EE } from "../settings/useSetting";
import { MuteStates } from "./MuteStates";

interface Props {
  matrixInfo: MatrixInfo;
  muteStates: MuteStates;
  onEnter: (e2eeConfig?: E2EEConfig) => void;
  isEmbedded: boolean;
  hideHeader: boolean;
}

export const LobbyView: FC<Props> = ({
  matrixInfo,
  muteStates,
  onEnter,
  isEmbedded,
  hideHeader,
}) => {
  const { t } = useTranslation();
  useLocationNavigation();

  const [enableE2EE] = useEnableE2EE();

  const joinCallButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (joinCallButtonRef.current) {
      joinCallButtonRef.current.focus();
    }
  }, [joinCallButtonRef]);

  const [e2eeSharedKey, setE2EESharedKey] = useState<string | undefined>(
    undefined
  );

  const onE2EESharedKeyChanged = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setE2EESharedKey(value === "" ? undefined : value);
    },
    [setE2EESharedKey]
  );

  return (
    <div className={styles.room}>
      {!hideHeader && (
        <Header>
          <LeftNav>
            <RoomHeaderInfo roomName={matrixInfo.roomName} />
          </LeftNav>
          <RightNav>
            <UserMenuContainer />
          </RightNav>
        </Header>
      )}
      <div className={styles.joinRoom}>
        <div className={styles.joinRoomContent}>
          <VideoPreview matrixInfo={matrixInfo} muteStates={muteStates} />
          {enableE2EE && (
            <InputField
              className={styles.passwordField}
              label={t("Password (if none, E2EE is disabled)")}
              type="text"
              onChange={onE2EESharedKeyChanged}
              value={e2eeSharedKey}
            />
          )}
          <Trans>
            <Button
              ref={joinCallButtonRef}
              className={styles.copyButton}
              size="lg"
              onPress={() =>
                onEnter(
                  e2eeSharedKey ? { sharedKey: e2eeSharedKey } : undefined
                )
              }
              data-testid="lobby_joinCall"
            >
              Join call now
            </Button>
            <Body>Or</Body>
            <CopyButton
              variant="secondaryCopy"
              value={getRoomUrl(matrixInfo.roomAlias ?? matrixInfo.roomId)}
              className={styles.copyButton}
              copiedMessage={t("Call link copied")}
              data-testid="lobby_inviteLink"
            >
              Copy call link and join later
            </CopyButton>
          </Trans>
        </div>
        {!isEmbedded && (
          <Body className={styles.joinRoomFooter}>
            <Link color="primary" to="/">
              {t("Take me Home")}
            </Link>
          </Body>
        )}
      </div>
    </div>
  );
};
