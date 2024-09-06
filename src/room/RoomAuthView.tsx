/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { FC, useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/src/logger";
import { Button } from "@vector-im/compound-web";

import styles from "./RoomAuthView.module.css";
import { Body, Caption, Link, Headline } from "../typography/Typography";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Form } from "../form/Form";
import { UserMenuContainer } from "../UserMenuContainer";
import { useRegisterPasswordlessUser } from "../auth/useRegisterPasswordlessUser";
import { Config } from "../config/Config";

export const RoomAuthView: FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const { registerPasswordlessUser, recaptchaId } =
    useRegisterPasswordlessUser();

  const onSubmit = useCallback(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    (e) => {
      e.preventDefault();
      setLoading(true);

      const data = new FormData(e.target);
      const dataForDisplayName = data.get("displayName");
      const displayName =
        typeof dataForDisplayName === "string" ? dataForDisplayName : "";

      registerPasswordlessUser(displayName).catch((error) => {
        logger.error("Failed to register passwordless user", e);
        setLoading(false);
        setError(error);
      });
    },
    [registerPasswordlessUser],
  );

  const { t } = useTranslation();
  const location = useLocation();

  return (
    <>
      <Header>
        <LeftNav>
          <HeaderLogo />
        </LeftNav>
        <RightNav>
          <UserMenuContainer preventNavigation />
        </RightNav>
      </Header>
      <div className={styles.container}>
        <main className={styles.main}>
          <Headline className={styles.headline}>
            {t("lobby.join_button")}
          </Headline>
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow>
              <InputField
                id="displayName"
                name="displayName"
                label={t("common.display_name")}
                placeholder={t("common.display_name")}
                data-testid="joincall_displayName"
                type="text"
                required
                autoComplete="off"
              />
            </FieldRow>
            <Caption>
              <Trans i18nKey="room_auth_view_eula_caption">
                By clicking "Join call now", you agree to our{" "}
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
            <Button
              type="submit"
              size="lg"
              disabled={loading}
              data-testid="joincall_joincall"
            >
              {loading ? t("common.loading") : t("room_auth_view_join_button")}
            </Button>
            <div id={recaptchaId} />
          </Form>
        </main>
        <Body className={styles.footer}>
          <Trans i18nKey="unauthenticated_view_body">
            Not registered yet?{" "}
            <Link
              color="primary"
              to={{ pathname: "/register", state: { from: location } }}
            >
              Create an account
            </Link>
          </Trans>
        </Body>
      </div>
    </>
  );
};
