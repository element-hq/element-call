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

import {
  ChangeEvent,
  FC,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useHistory, useLocation } from "react-router-dom";
import { captureException } from "@sentry/react";
import { sleep } from "matrix-js-sdk/src/utils";
import { Trans, useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/src/logger";
import { Button } from "@vector-im/compound-web";

import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { useClientLegacy } from "../ClientContext";
import { useInteractiveRegistration } from "./useInteractiveRegistration";
import styles from "./LoginPage.module.css";
import Logo from "../icons/LogoLarge.svg?react";
import { LoadingView } from "../FullScreenView";
import { useRecaptcha } from "./useRecaptcha";
import { Caption, Link } from "../typography/Typography";
import { usePageTitle } from "../usePageTitle";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { Config } from "../config/Config";

export const RegisterPage: FC = () => {
  const { t } = useTranslation();
  usePageTitle(t("action.register"));

  const { loading, authenticated, passwordlessUser, client, setClient } =
    useClientLegacy();

  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const history = useHistory();
  const location = useLocation();
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<Error>();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const { recaptchaKey, register } = useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const onSubmitRegisterForm = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.target as HTMLFormElement);
      const userName = data.get("userName") as string;
      const password = data.get("password") as string;
      const passwordConfirmation = data.get("passwordConfirmation") as string;

      if (password !== passwordConfirmation) return;

      const submit = async (): Promise<void> => {
        setRegistering(true);

        const recaptchaResponse = await execute();
        const [newClient, session] = await register(
          userName,
          password,
          userName,
          recaptchaResponse,
          passwordlessUser,
        );

        if (client && client?.groupCallEventHandler && passwordlessUser) {
          // Migrate the user's rooms
          for (const groupCall of client.groupCallEventHandler.groupCalls.values()) {
            const roomId = groupCall.room.roomId;

            try {
              await newClient.joinRoom(roomId);
            } catch (error) {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              if (error.errcode === "M_LIMIT_EXCEEDED") {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                await sleep(error.data.retry_after_ms);
                await newClient.joinRoom(roomId);
              } else {
                captureException(error);
                logger.error(`Couldn't join room ${roomId}`, error);
              }
            }
          }
        }

        setClient?.({ client: newClient, session });
        PosthogAnalytics.instance.eventSignup.cacheSignupEnd(new Date());
      };

      submit()
        .then(() => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          if (location.state?.from) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            history.push(location.state?.from);
          } else {
            history.push("/");
          }
        })
        .catch((error) => {
          setError(error);
          setRegistering(false);
          reset();
        });
    },
    [
      register,
      location,
      history,
      passwordlessUser,
      reset,
      execute,
      client,
      setClient,
    ],
  );

  useEffect(() => {
    if (password && passwordConfirmation && password !== passwordConfirmation) {
      confirmPasswordRef.current?.setCustomValidity(
        t("register.passwords_must_match"),
      );
    } else {
      confirmPasswordRef.current?.setCustomValidity("");
    }
  }, [password, passwordConfirmation, t]);

  useEffect(() => {
    if (!loading && authenticated && !passwordlessUser && !registering) {
      history.push("/");
    }
  }, [loading, history, authenticated, passwordlessUser, registering]);

  if (loading) {
    return <LoadingView />;
  } else {
    PosthogAnalytics.instance.eventSignup.cacheSignupStart(new Date());
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.formContainer}>
            <Logo width="auto" height="auto" className={styles.logo} />
            <h2>{t("register_heading")}</h2>
            <form onSubmit={onSubmitRegisterForm}>
              <FieldRow>
                <InputField
                  type="text"
                  name="userName"
                  placeholder={t("common.username")}
                  label={t("common.username")}
                  autoCorrect="off"
                  autoCapitalize="none"
                  prefix="@"
                  suffix={`:${Config.defaultServerName()}`}
                  data-testid="register_username"
                />
              </FieldRow>
              <FieldRow>
                <InputField
                  required
                  name="password"
                  type="password"
                  onChange={(e: ChangeEvent<HTMLInputElement>): void =>
                    setPassword(e.target.value)
                  }
                  value={password}
                  placeholder={t("common.password")}
                  label={t("common.password")}
                  data-testid="register_password"
                />
              </FieldRow>
              <FieldRow>
                <InputField
                  required
                  type="password"
                  name="passwordConfirmation"
                  onChange={(e: ChangeEvent<HTMLInputElement>): void =>
                    setPasswordConfirmation(e.target.value)
                  }
                  value={passwordConfirmation}
                  placeholder={t("register_confirm_password_label")}
                  label={t("register_confirm_password_label")}
                  ref={confirmPasswordRef}
                  data-testid="register_confirm_password"
                />
              </FieldRow>
              <Caption>
                <Trans i18nKey="recaptcha_caption">
                  This site is protected by ReCAPTCHA and the Google{" "}
                  <Link href="https://www.google.com/policies/privacy/">
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link href="https://policies.google.com/terms">
                    Terms of Service
                  </Link>{" "}
                  apply.
                  <br />
                  By clicking "Register", you agree to our{" "}
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
              <FieldRow>
                <Button
                  type="submit"
                  disabled={registering}
                  data-testid="register_register"
                >
                  {registering
                    ? t("register.registering")
                    : t("action.register")}
                </Button>
              </FieldRow>
              <div id={recaptchaId} />
            </form>
          </div>
          <div className={styles.authLinks}>
            <Trans i18nKey="register_auth_links">
              <p>Already have an account?</p>
              <p>
                <Link to="/login">Log in</Link>
                {" Or "}
                <Link to="/">Access as a guest</Link>
              </p>
            </Trans>
          </div>
        </div>
      </div>
    </>
  );
};
