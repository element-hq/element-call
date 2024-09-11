/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { FC, useCallback, useState, FormEventHandler } from "react";
import { useHistory } from "react-router-dom";
import { randomString } from "matrix-js-sdk/src/randomstring";
import { Trans, useTranslation } from "react-i18next";
import { Button, Dropdown, Heading } from "@vector-im/compound-web";
import { logger } from "matrix-js-sdk/src/logger";

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
import { Body, Caption, Link } from "../typography/Typography";
import { Form } from "../form/Form";
import styles from "./UnauthenticatedView.module.css";
import commonStyles from "./common.module.css";
import { generateRandomName } from "../auth/generateRandomName";
import { AnalyticsNotice } from "../analytics/AnalyticsNotice";
import { Config } from "../config/Config";
import { E2eeType } from "../e2ee/e2eeType";
import { useOptInAnalytics } from "../settings/settings";

const encryptionOptions = {
  shared: {
    label: "Shared key",
    e2eeType: E2eeType.SHARED_KEY,
  },
  sender: {
    label: "Per-participant key",
    e2eeType: E2eeType.PER_PARTICIPANT,
  },
  none: { label: "None", e2eeType: E2eeType.NONE },
};

export const UnauthenticatedView: FC = () => {
  const { setClient } = useClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const [optInAnalytics] = useOptInAnalytics();
  const { recaptchaKey, register } = useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const [encryption, setEncryption] =
    useState<keyof typeof encryptionOptions>("shared");

  const [joinExistingCallModalOpen, setJoinExistingCallModalOpen] =
    useState(false);
  const onDismissJoinExistingCallModal = useCallback(
    () => setJoinExistingCallModalOpen(false),
    [setJoinExistingCallModalOpen],
  );
  const [onFinished, setOnFinished] = useState<() => void>();
  const history = useHistory();
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
          randomString(16),
          displayName,
          recaptchaResponse,
          true,
        );

        let roomId;
        let encryptionSystem;
        try {
          const res = await createRoom(
            client,
            roomName,
            encryptionOptions[encryption].e2eeType,
          );
          roomId = res.roomId;
          encryptionSystem = res.encryptionSystem;
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
        // if (!createRoomResult.password)
        //   throw new Error("Failed to create room with shared secret");

        setClient({ client, session });
        history.push(getRelativeRoomUrl(roomId, encryptionSystem, roomName));
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
      history,
      setJoinExistingCallModalOpen,
      setClient,
      encryption,
    ],
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
              <Caption className={styles.notice}>
                <AnalyticsNotice />
              </Caption>
            )}
            <Caption className={styles.notice}>
              <Trans i18nKey="unauthenticated_view_eula_caption">
                By clicking "Go", you agree to our{" "}
                <Link href={Config.get().eula}>
                  End User Licensing Agreement (EULA)
                </Link>
              </Trans>
            </Caption>
            {error && (
              <FieldRow>
                <ErrorMessage error={error} />
              </FieldRow>
            )}
            <Dropdown
              label="Encryption"
              defaultValue={encryption}
              onValueChange={(x) =>
                setEncryption(x as keyof typeof encryptionOptions)
              }
              values={Object.keys(encryptionOptions).map((value) => [
                value,
                encryptionOptions[value as keyof typeof encryptionOptions]
                  .label,
              ])}
              placeholder=""
            />

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
          <Body className={styles.mobileLoginLink}>
            <Link color="primary" to="/login" data-testid="home_login">
              {t("unauthenticated_view_login_button")}
            </Link>
          </Body>
          <Body>
            <Trans i18nKey="unauthenticated_view_body">
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
