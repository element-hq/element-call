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

import React, { useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";

import styles from "./RoomAuthView.module.css";
import { Button } from "../button";
import { Body, Caption, Link, Headline } from "../typography/Typography";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Form } from "../form/Form";
import { UserMenuContainer } from "../UserMenuContainer";
import { useRegisterPasswordlessUser } from "../auth/useRegisterPasswordlessUser";

export function RoomAuthView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const { registerPasswordlessUser, recaptchaId, privacyPolicyUrl } =
    useRegisterPasswordlessUser();

  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const dataForDisplayName = data.get("displayName");
      const displayName =
        typeof dataForDisplayName === "string" ? dataForDisplayName : "";

      registerPasswordlessUser(displayName).catch((error) => {
        console.error("Failed to register passwordless user", e);
        setLoading(false);
        setError(error);
      });
    },
    [registerPasswordlessUser]
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
          <Headline className={styles.headline}>{t("Join call")}</Headline>
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow>
              <InputField
                id="displayName"
                name="displayName"
                label={t("Display name")}
                placeholder={t("Display name")}
                data-testid="joincall_displayName"
                type="text"
                required
                autoComplete="off"
              />
            </FieldRow>
            <Caption>
              <Trans>
                By clicking "Join call now", you agree to our{" "}
                <Link href={privacyPolicyUrl}>Terms and conditions</Link>
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
              {loading ? t("Loading…") : t("Join call now")}
            </Button>
            <div id={recaptchaId} />
          </Form>
        </main>
        <Body className={styles.footer}>
          <Trans>
            Not registered yet?{" "}
            <Link
              color="primary"
              to={{ pathname: "/login", state: { from: location } }}
            >
              Create an account
            </Link>
          </Trans>
        </Body>
      </div>
    </>
  );
}
