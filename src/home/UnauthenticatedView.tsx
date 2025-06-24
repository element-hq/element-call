/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useState, type FormEventHandler } from "react";
import { secureRandomString } from "matrix-js-sdk/lib/randomstring";
import { Trans, useTranslation } from "react-i18next";
import { Button, Heading, Text } from "@vector-im/compound-web";
import { logger } from "matrix-js-sdk/lib/logger";
import { useNavigate } from "react-router-dom";

import { useClient } from "../ClientContext";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { UserMenuContainer } from "../UserMenuContainer";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import {
  createRoom,
  getRelativeRoomUrl,
  roomAliasLocalpartFromRoomName,
  sanitiseRoomNameInput,
} from "../utils/matrix";
import { useInteractiveRegistration } from "../auth/useInteractiveRegistration";
import { JoinExistingCallModal } from "./JoinExistingCallModal";
import { useRecaptcha } from "../auth/useRecaptcha";
import { Form } from "../form/Form";
import styles from "./UnauthenticatedView.module.css";
import commonStyles from "./common.module.css";
import { generateRandomName } from "../auth/generateRandomName";
import { AnalyticsNotice } from "../analytics/AnalyticsNotice";
import { Config } from "../config/Config";
import { E2eeType } from "../e2ee/e2eeType";
import { useOptInAnalytics } from "../settings/settings";
import { ExternalLink, Link } from "../button/Link";
import { useUrlParams } from "../UrlParams";

export const UnauthenticatedView: FC = () => {
  const { setClient } = useClient();
  const { header } = useUrlParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const [optInAnalytics] = useOptInAnalytics();
  const { recaptchaKey, register } = useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const [joinExistingCallModalOpen, setJoinExistingCallModalOpen] =
    useState(false);
  const onDismissJoinExistingCallModal = useCallback(
    () => setJoinExistingCallModalOpen(false),
    [setJoinExistingCallModalOpen],
  );
  const [onFinished, setOnFinished] = useState<() => void>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const onSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target as HTMLFormElement);
      const roomName = sanitiseRoomNameInput(data.get("callName") as string);
      const displayName = data.get("displayName") as string;

      async function submit(): Promise<void> {
        setError(undefined);
        setLoading(true);
        const recaptchaResponse = await execute();
        const userName = generateRandomName();
        const [client, session] = await register(
          userName,
          secureRandomString(16),
          displayName,
          recaptchaResponse,
          true,
        );

        let createRoomResult;
        try {
          createRoomResult = await createRoom(
            client,
            roomName,
            E2eeType.SHARED_KEY,
          );
        } catch (error) {
          if (!setClient) {
            throw error;
          }

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          if (error.errcode === "M_ROOM_IN_USE") {
            setOnFinished(() => {
              setClient(client, session);
              const aliasLocalpart = roomAliasLocalpartFromRoomName(roomName);
              navigate(`/${aliasLocalpart}`)?.catch((error) => {
                logger.error("Failed to navigate to alias localpart", error);
              });
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
        if (!createRoomResult.password)
          throw new Error("Failed to create room with shared secret");

        setClient(client, session);
        await navigate(
          getRelativeRoomUrl(
            createRoomResult.roomId,
            { kind: E2eeType.SHARED_KEY, secret: createRoomResult.password },
            roomName,
          ),
        );
      }

      submit().catch((error) => {
        logger.error(error);
        setLoading(false);
        setError(error);
        reset();
      });
    },
    [
      register,
      reset,
      execute,
      navigate,
      setJoinExistingCallModalOpen,
      setClient,
    ],
  );

  return (
    <>
      <div className={commonStyles.container}>
        {header === "standard" && (
          <Header>
            <LeftNav>
              <HeaderLogo />
            </LeftNav>
            <RightNav hideMobile>
              <UserMenuContainer />
            </RightNav>
          </Header>
        )}
        <main className={commonStyles.main}>
          <HeaderLogo className={commonStyles.logo} />
          <Heading size="lg" weight="semibold">
            {t("start_new_call")}
          </Heading>
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow>
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
            </FieldRow>
            <FieldRow>
              <InputField
                id="displayName"
                name="displayName"
                label={t("common.display_name")}
                placeholder={t("common.display_name")}
                type="text"
                required
                data-testid="home_displayName"
                autoComplete="off"
              />
            </FieldRow>
            {optInAnalytics === null && (
              <Text size="sm" className={styles.notice}>
                <AnalyticsNotice />
              </Text>
            )}
            <Text size="sm" className={styles.notice}>
              <Trans i18nKey="unauthenticated_view_ssla_caption">
                By clicking "Go", you agree to our{" "}
                <ExternalLink href={Config.get().ssla}>
                  Software and Services License Agreement (SSLA)
                </ExternalLink>
              </Trans>
            </Text>
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
              {loading ? t("common.loading") : t("action.go")}
            </Button>
            <div id={recaptchaId} />
          </Form>
        </main>
        <footer className={styles.footer}>
          <Text className={styles.mobileLoginLink}>
            <Link to="/login" data-testid="home_login">
              {t("unauthenticated_view_login_button")}
            </Link>
          </Text>
          <Text>
            <Trans i18nKey="unauthenticated_view_body">
              Not registered yet?{" "}
              <Link to="/register" data-testid="home_register">
                Create an account
              </Link>
            </Trans>
          </Text>
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
