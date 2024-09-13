/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useState, useCallback, FormEvent, FormEventHandler, FC } from "react";
import { useHistory } from "react-router-dom";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { useTranslation } from "react-i18next";
import { Heading, Text } from "@vector-im/compound-web";
import { logger } from "matrix-js-sdk/src/logger";
import { Button } from "@vector-im/compound-web";

import {
  createRoom,
  getRelativeRoomUrl,
  roomAliasLocalpartFromRoomName,
  sanitiseRoomNameInput,
} from "../utils/matrix";
import { useGroupCallRooms } from "./useGroupCallRooms";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import commonStyles from "./common.module.css";
import styles from "./RegisteredView.module.css";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { CallList } from "./CallList";
import { UserMenuContainer } from "../UserMenuContainer";
import { JoinExistingCallModal } from "./JoinExistingCallModal";
import { Form } from "../form/Form";
import { AnalyticsNotice } from "../analytics/AnalyticsNotice";
import { E2eeType } from "../e2ee/e2eeType";
import { useOptInAnalytics } from "../settings/settings";

interface Props {
  client: MatrixClient;
}

export const RegisteredView: FC<Props> = ({ client }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const [optInAnalytics] = useOptInAnalytics();
  const history = useHistory();
  const { t } = useTranslation();
  const [joinExistingCallModalOpen, setJoinExistingCallModalOpen] =
    useState(false);
  const onDismissJoinExistingCallModal = useCallback(
    () => setJoinExistingCallModalOpen(false),
    [setJoinExistingCallModalOpen],
  );

  const onSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const data = new FormData(e.target as HTMLFormElement);
      const roomNameData = data.get("callName");
      const roomName =
        typeof roomNameData === "string"
          ? sanitiseRoomNameInput(roomNameData)
          : "";

      async function submit(): Promise<void> {
        setError(undefined);
        setLoading(true);

        const createRoomResult = await createRoom(
          client,
          roomName,
          E2eeType.SHARED_KEY,
        );
        if (createRoomResult.encryptionSystem.kind !== E2eeType.SHARED_KEY)
          throw new Error("Failed to create room with shared secret");

        history.push(
          getRelativeRoomUrl(
            createRoomResult.roomId,
            createRoomResult.encryptionSystem,
            roomName,
          ),
        );
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
    [client, history, setJoinExistingCallModalOpen],
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
            {t("start_new_call")}
          </Heading>
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow className={styles.fieldRow}>
              <InputField
                id="callName"
                name="callName"
                label={t("call_name")}
                placeholder={t("call_name")}
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
                {loading ? t("common.loading") : t("action.go")}
              </Button>
            </FieldRow>
            {optInAnalytics === null && (
              <Text size="sm" className={styles.notice}>
                <AnalyticsNotice />
              </Text>
            )}
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
};
