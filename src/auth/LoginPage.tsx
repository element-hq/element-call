/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type FormEvent, useCallback, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@vector-im/compound-web";

import Logo from "../icons/LogoLarge.svg?react";
import { useClient } from "../ClientContext";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import styles from "./LoginPage.module.css";
import { useInteractiveLogin } from "./useInteractiveLogin";
import { usePageTitle } from "../usePageTitle";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { Config } from "../config/Config";
import { Link } from "../button/Link";

export const LoginPage: FC = () => {
  const { t } = useTranslation();
  usePageTitle(t("login_title"));

  const { client, setClient } = useClient();
  const login = useInteractiveLogin(client);
  const homeserver = Config.defaultHomeserverUrl(); // TODO: Make this configurable
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  // TODO: Handle hitting login page with authenticated client

  const onSubmitLoginForm = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);

      if (!homeserver || !usernameRef.current || !passwordRef.current) {
        setError(Error("Login parameters are undefined"));
        setLoading(false);
        return;
      }

      login(homeserver, usernameRef.current.value, passwordRef.current.value)
        .then(async ([client, session]) => {
          if (!setClient) {
            return;
          }

          setClient(client, session);

          const locationState = location.state;
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          if (locationState && locationState.from) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            await navigate(locationState.from);
          } else {
            await navigate("/");
          }
          PosthogAnalytics.instance.eventLogin.track();
        })
        .catch((error) => {
          setError(error);
          setLoading(false);
        });
    },
    [login, location, navigate, homeserver, setClient],
  );
  // we need to limit the length of the homserver name to not cover the whole loginview input with the string.
  let shortendHomeserverName = Config.defaultServerName()?.slice(0, 25);
  shortendHomeserverName =
    shortendHomeserverName?.length !== Config.defaultServerName()?.length
      ? shortendHomeserverName + "..."
      : shortendHomeserverName;
  return (
    <>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.formContainer}>
            <Logo width="auto" height="auto" className={styles.logo} />

            <h2>{t("log_in")}</h2>
            <h4>{t("login_subheading")}</h4>
            <form onSubmit={onSubmitLoginForm}>
              <FieldRow>
                <InputField
                  type="text"
                  ref={usernameRef}
                  placeholder={t("common.username")}
                  label={t("common.username")}
                  autoCorrect="off"
                  autoCapitalize="none"
                  prefix="@"
                  suffix={`:${shortendHomeserverName}`}
                  data-testid="login_username"
                />
              </FieldRow>
              <FieldRow>
                <InputField
                  type="password"
                  ref={passwordRef}
                  placeholder={t("common.password")}
                  label={t("common.password")}
                  data-testid="login_password"
                />
              </FieldRow>
              {error && (
                <FieldRow>
                  <ErrorMessage error={error} />
                </FieldRow>
              )}
              <FieldRow>
                <Button
                  type="submit"
                  disabled={loading}
                  data-testid="login_login"
                >
                  {loading ? t("logging_in") : t("login_title")}
                </Button>
              </FieldRow>
            </form>
          </div>
          <div className={styles.authLinks}>
            <p>{t("login_auth_links_prompt")}</p>
            <p>
              <Trans i18nKey="login_auth_links">
                <Link to="/register">Create an account</Link>
                {" Or "}
                <Link to="/">Access as a guest</Link>
              </Trans>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
