/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/lib/logger";
import { Button, Heading, Text } from "@vector-im/compound-web";

import styles from "./RoomAuthView.module.css";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Form } from "../form/Form";
import { UserMenuContainer } from "../UserMenuContainer";
import { useRegisterPasswordlessUser } from "../auth/useRegisterPasswordlessUser";
import { Config } from "../config/Config";
import { ExternalLink, Link } from "../button/Link";
import { useUrlParams } from "../UrlParams";

export const RoomAuthView: FC = () => {
  const { header } = useUrlParams();
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
      {header === "standard" && (
        <Header>
          <LeftNav>
            <HeaderLogo />
          </LeftNav>
          <RightNav>
            <UserMenuContainer preventNavigation />
          </RightNav>
        </Header>
      )}
      <div className={styles.container}>
        <main className={styles.main}>
          <Heading size="xl" weight="semibold" className={styles.headline}>
            {t("lobby.join_as_guest")}
          </Heading>
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
            <Text size="sm">
              <Trans i18nKey="room_auth_view_ssla_caption">
                By clicking "Join call now", you agree to our{" "}
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
              data-testid="joincall_joincall"
            >
              {loading
                ? t("common.loading")
                : t("room_auth_view_continue_button")}
            </Button>
            <div id={recaptchaId} />
          </Form>
        </main>
        <Text className={styles.footer}>
          <Trans i18nKey="unauthenticated_view_body">
            Not registered yet?{" "}
            <Link to="/register" state={{ from: location }}>
              Create an account
            </Link>
          </Trans>
        </Text>
      </div>
    </>
  );
};
