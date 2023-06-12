/*
Copyright 2021-2022 New Vector Ltd

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

import React, { FC, FormEvent, useCallback, useRef, useState } from "react";
import { useHistory, useLocation, Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";

import { ReactComponent as Logo } from "../icons/LogoLarge.svg";
import { useClient } from "../ClientContext";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Button } from "../button";
import styles from "./LoginPage.module.css";
import { useInteractiveLogin } from "./useInteractiveLogin";
import { usePageTitle } from "../usePageTitle";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { Config } from "../config/Config";

export const LoginPage: FC = () => {
  const { t } = useTranslation();
  usePageTitle(t("Login"));

  const { setClient } = useClient();
  const login = useInteractiveLogin();
  const homeserver = Config.defaultHomeserverUrl(); // TODO: Make this configurable
  const usernameRef = useRef<HTMLInputElement>();
  const passwordRef = useRef<HTMLInputElement>();
  const history = useHistory();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  // TODO: Handle hitting login page with authenticated client

  const onSubmitLoginForm = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);

      login(homeserver, usernameRef.current.value, passwordRef.current.value)
        .then(([client, session]) => {
          setClient(client, session);

          if (location.state && location.state.from) {
            history.push(location.state.from);
          } else {
            history.push("/");
          }
          PosthogAnalytics.instance.eventLogin.track();
        })
        .catch((error) => {
          setError(error);
          setLoading(false);
        });
    },
    [login, location, history, homeserver, setClient]
  );

  return (
    <>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.formContainer}>
            <Logo width="auto" height="auto" className={styles.logo} />

            <h2>Log In</h2>
            <h4>To continue to Element</h4>
            <form onSubmit={onSubmitLoginForm}>
              <FieldRow>
                <InputField
                  type="text"
                  ref={usernameRef}
                  placeholder={t("Username")}
                  label={t("Username")}
                  autoCorrect="off"
                  autoCapitalize="none"
                  prefix="@"
                  suffix={`:${Config.defaultServerName()}`}
                  data-testid="login_username"
                />
              </FieldRow>
              <FieldRow>
                <InputField
                  type="password"
                  ref={passwordRef}
                  placeholder={t("Password")}
                  label={t("Password")}
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
                  {loading ? t("Logging in…") : t("Login")}
                </Button>
              </FieldRow>
            </form>
          </div>
          <div className={styles.authLinks}>
            <p>Not registered yet?</p>
            <p>
              <Trans>
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
