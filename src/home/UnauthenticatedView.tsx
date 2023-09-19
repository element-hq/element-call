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

import { FC, useCallback, useState, FormEventHandler } from "react";
import { useHistory } from "react-router-dom";
import { randomString } from "matrix-js-sdk/src/randomstring";
import { Trans, useTranslation } from "react-i18next";
import { Heading } from "@vector-im/compound-web";

import { useClient } from "../ClientContext";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { UserMenuContainer } from "../UserMenuContainer";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Button } from "../button";
import {
  CreateRoomResult,
  createRoom,
  getRelativeRoomUrl,
  roomAliasLocalpartFromRoomName,
  sanitiseRoomNameInput,
} from "../matrix-utils";
import { useInteractiveRegistration } from "../auth/useInteractiveRegistration";
import { JoinExistingCallModal } from "./JoinExistingCallModal";
import { useRecaptcha } from "../auth/useRecaptcha";
import { Body, Caption, Link } from "../typography/Typography";
import { Form } from "../form/Form";
import styles from "./UnauthenticatedView.module.css";
import commonStyles from "./common.module.css";
import { generateRandomName } from "../auth/generateRandomName";
import { AnalyticsNotice } from "../analytics/AnalyticsNotice";
import { useEnableE2EE, useOptInAnalytics } from "../settings/useSetting";
import { Config } from "../config/Config";
import { E2EEBanner } from "../E2EEBanner";
import { getRoomSharedKeyLocalStorageKey } from "../e2ee/sharedKeyManagement";
import { setLocalStorageItem } from "../useLocalStorage";

export const UnauthenticatedView: FC = () => {
  const { setClient } = useClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const [optInAnalytics] = useOptInAnalytics();
  const { recaptchaKey, register } = useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const [joinExistingCallModalOpen, setJoinExistingCallModalOpen] =
    useState(false);
  const onDismissJoinExistingCallModal = useCallback(
    () => setJoinExistingCallModalOpen(false),
    [setJoinExistingCallModalOpen]
  );
  const [onFinished, setOnFinished] = useState<() => void>();
  const history = useHistory();
  const { t } = useTranslation();

  const [e2eeEnabled] = useEnableE2EE();

  const onSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target as HTMLFormElement);
      const roomName = sanitiseRoomNameInput(data.get("callName") as string);
      const displayName = data.get("displayName") as string;

      async function submit() {
        setError(undefined);
        setLoading(true);
        const recaptchaResponse = await execute();
        const userName = generateRandomName();
        const [client, session] = await register(
          userName,
          randomString(16),
          displayName,
          recaptchaResponse,
          true
        );

        let createResult: CreateRoomResult;
        try {
          createResult = await createRoom(
            client,
            roomName,
            e2eeEnabled ?? false
          );

          if (e2eeEnabled) {
            setLocalStorageItem(
              getRoomSharedKeyLocalStorageKey(createResult.roomId),
              randomString(32)
            );
          }
        } catch (error) {
          if (!setClient) {
            throw error;
          }

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          if (error.errcode === "M_ROOM_IN_USE") {
            setOnFinished(() => {
              setClient({ client, session });
              const aliasLocalpart = roomAliasLocalpartFromRoomName(roomName);
              history.push(`/${aliasLocalpart}`);
            });

            setLoading(false);
            setJoinExistingCallModalOpen(true);
            return;
          } else {
            throw error;
          }
        }

        // Only consider the registration successful if we managed to create the room, too
        if (!setClient) {
          throw new Error("setClient is undefined");
        }

        setClient({ client, session });
        history.push(
          getRelativeRoomUrl(
            createResult.roomId,
            roomName,
            createResult.roomAlias
          )
        );
      }

      submit().catch((error) => {
        console.error(error);
        setLoading(false);
        setError(error);
        reset();
      });
    },
    [
      register,
      reset,
      execute,
      history,
      setJoinExistingCallModalOpen,
      setClient,
      e2eeEnabled,
    ]
  );

  return (
    <>
      <div className={commonStyles.container}>
        <Header>
          <LeftNav>
            <HeaderLogo />
          </LeftNav>
          <RightNav hideMobile>
            <UserMenuContainer />
          </RightNav>
        </Header>
        <main className={commonStyles.main}>
          <HeaderLogo className={commonStyles.logo} />
          <Heading size="lg" weight="semibold">
            {t("Start new call")}
          </Heading>
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow>
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
            </FieldRow>
            <FieldRow>
              <InputField
                id="displayName"
                name="displayName"
                label={t("Display name")}
                placeholder={t("Display name")}
                type="text"
                required
                data-testid="home_displayName"
                autoComplete="off"
              />
            </FieldRow>
            {optInAnalytics === null && (
              <Caption className={styles.notice}>
                <AnalyticsNotice />
              </Caption>
            )}
            <Caption className={styles.notice}>
              <Trans>
                By clicking "Go", you agree to our{" "}
                <Link href={Config.get().eula}>
                  End User Licensing Agreement (EULA)
                </Link>
              </Trans>
            </Caption>
            <E2EEBanner />
            {error && (
              <FieldRow>
                <ErrorMessage error={error} />
              </FieldRow>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={loading}
              data-testid="home_go"
            >
              {loading ? t("Loading…") : t("Go")}
            </Button>
            <div id={recaptchaId} />
          </Form>
        </main>
        <footer className={styles.footer}>
          <Body className={styles.mobileLoginLink}>
            <Link color="primary" to="/login" data-testid="home_login">
              {t("Login to your account")}
            </Link>
          </Body>
          <Body>
            <Trans>
              Not registered yet?{" "}
              <Link color="primary" to="/register" data-testid="home_register">
                Create an account
              </Link>
            </Trans>
          </Body>
        </footer>
      </div>
      {onFinished && (
        <JoinExistingCallModal
          onJoin={onFinished}
          open={joinExistingCallModalOpen}
          onDismiss={onDismissJoinExistingCallModal}
        />
      )}
    </>
  );
};
