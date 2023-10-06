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

import { useState, useCallback, FormEvent, FormEventHandler } from "react";
import { useHistory } from "react-router-dom";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { randomString } from "matrix-js-sdk/src/randomstring";
import { useTranslation } from "react-i18next";
import { Heading } from "@vector-im/compound-web";
import { logger } from "matrix-js-sdk/src/logger";

import {
  createRoom,
  getRelativeRoomUrl,
  roomAliasLocalpartFromRoomName,
  sanitiseRoomNameInput,
} from "../matrix-utils";
import { useGroupCallRooms } from "./useGroupCallRooms";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import commonStyles from "./common.module.css";
import styles from "./RegisteredView.module.css";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Button } from "../button";
import { CallList } from "./CallList";
import { UserMenuContainer } from "../UserMenuContainer";
import { JoinExistingCallModal } from "./JoinExistingCallModal";
import { Caption } from "../typography/Typography";
import { Form } from "../form/Form";
import { useEnableE2EE, useOptInAnalytics } from "../settings/useSetting";
import { AnalyticsNotice } from "../analytics/AnalyticsNotice";
import { E2EEBanner } from "../E2EEBanner";
import { setLocalStorageItem } from "../useLocalStorage";
import { getRoomSharedKeyLocalStorageKey } from "../e2ee/sharedKeyManagement";

interface Props {
  client: MatrixClient;
}

export function RegisteredView({ client }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const [optInAnalytics] = useOptInAnalytics();
  const history = useHistory();
  const { t } = useTranslation();
  const [joinExistingCallModalOpen, setJoinExistingCallModalOpen] =
    useState(false);
  const onDismissJoinExistingCallModal = useCallback(
    () => setJoinExistingCallModalOpen(false),
    [setJoinExistingCallModalOpen]
  );
  const [e2eeEnabled] = useEnableE2EE();

  const onSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const data = new FormData(e.target as HTMLFormElement);
      const roomNameData = data.get("callName");
      const roomName =
        typeof roomNameData === "string"
          ? sanitiseRoomNameInput(roomNameData)
          : "";

      async function submit() {
        setError(undefined);
        setLoading(true);

        const roomId = (
          await createRoom(client, roomName, e2eeEnabled ?? false)
        )[1];

        const roomPassword = randomString(32);

        if (e2eeEnabled) {
          setLocalStorageItem(
            getRoomSharedKeyLocalStorageKey(roomId),
            roomPassword
          );
        }

        history.push(getRelativeRoomUrl(roomId, roomName, roomPassword));
      }

      submit().catch((error) => {
        if (error.errcode === "M_ROOM_IN_USE") {
          setExistingAlias(roomAliasLocalpartFromRoomName(roomName));
          setLoading(false);
          setError(undefined);
          setJoinExistingCallModalOpen(true);
        } else {
          logger.error(error);
          setLoading(false);
          setError(error);
        }
      });
    },
    [client, history, setJoinExistingCallModalOpen, e2eeEnabled]
  );

  const recentRooms = useGroupCallRooms(client);

  const [existingAlias, setExistingAlias] = useState<string>();
  const onJoinExistingRoom = useCallback(() => {
    history.push(`/${existingAlias}`);
  }, [history, existingAlias]);

  return (
    <>
      <div className={commonStyles.container}>
        <Header>
          <LeftNav>
            <HeaderLogo />
          </LeftNav>
          <RightNav>
            <UserMenuContainer />
          </RightNav>
        </Header>
        <main className={commonStyles.main}>
          <HeaderLogo className={commonStyles.logo} />
          <Heading size="lg" weight="semibold">
            {t("Start new call")}
          </Heading>
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow className={styles.fieldRow}>
              <InputField
                id="callName"
                name="callName"
                label={t("Name of call")}
                placeholder={t("Name of call")}
                type="text"
                required
                autoComplete="off"
                data-testid="home_callName"
              />

              <Button
                type="submit"
                size="lg"
                className={styles.button}
                disabled={loading}
                data-testid="home_go"
              >
                {loading ? t("Loading…") : t("Go")}
              </Button>
            </FieldRow>
            {optInAnalytics === null && (
              <Caption className={styles.notice}>
                <AnalyticsNotice />
              </Caption>
            )}
            <E2EEBanner />
            {error && (
              <FieldRow className={styles.fieldRow}>
                <ErrorMessage error={error} />
              </FieldRow>
            )}
          </Form>
          {recentRooms.length > 0 && (
            <CallList rooms={recentRooms} client={client} />
          )}
        </main>
      </div>
      <JoinExistingCallModal
        onJoin={onJoinExistingRoom}
        open={joinExistingCallModalOpen}
        onDismiss={onDismissJoinExistingCallModal}
      />
    </>
  );
}
