/*
Copyright 2021 New Vector Ltd

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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { captureException } from "@sentry/react";
import { sleep } from "matrix-js-sdk/src/utils";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Button } from "../button";
import { useClient } from "../ClientContext";
import { defaultHomeserverHost } from "../matrix-utils";
import { useInteractiveRegistration } from "./useInteractiveRegistration";
import styles from "./LoginPage.module.css";
import { ReactComponent as Logo } from "../icons/LogoLarge.svg";
import { LoadingView } from "../FullScreenView";
import { useRecaptcha } from "./useRecaptcha";
import { Caption, Link } from "../typography/Typography";
import { usePageTitle } from "../usePageTitle";

export function RegisterPage() {
  usePageTitle("Register");

  const { loading, isAuthenticated, isPasswordlessUser, client, setClient } =
    useClient();
  const confirmPasswordRef = useRef();
  const history = useHistory();
  const location = useLocation();
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [privacyPolicyUrl, recaptchaKey, register] =
    useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const onSubmitRegisterForm = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const userName = data.get("userName");
      const password = data.get("password");
      const passwordConfirmation = data.get("passwordConfirmation");

      if (password !== passwordConfirmation) {
        return;
      }

      async function submit() {
        setRegistering(true);

        let roomIds;

        if (client && isPasswordlessUser) {
          const groupCalls = client.groupCallEventHandler.groupCalls.values();
          roomIds = Array.from(groupCalls).map(
            (groupCall) => groupCall.room.roomId
          );
        }

        const recaptchaResponse = await execute();
        const [newClient, session] = await register(
          userName,
          password,
          userName,
          recaptchaResponse
        );

        if (roomIds) {
          for (const roomId of roomIds) {
            try {
              await newClient.joinRoom(roomId);
            } catch (error) {
              if (error.errcode === "M_LIMIT_EXCEEDED") {
                await sleep(error.data.retry_after_ms);
                await newClient.joinRoom(roomId);
              } else {
                captureException(error);
                console.error(`Couldn't join room ${roomId}`, error);
              }
            }
          }
        }

        setClient(newClient, session);
      }

      submit()
        .then(() => {
          if (location.state && location.state.from) {
            history.push(location.state.from);
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
    [register, location, history, isPasswordlessUser, reset, execute, client]
  );

  useEffect(() => {
    if (!confirmPasswordRef.current) {
      return;
    }

    if (password && passwordConfirmation && password !== passwordConfirmation) {
      confirmPasswordRef.current.setCustomValidity("Passwords must match");
    } else {
      confirmPasswordRef.current.setCustomValidity("");
    }
  }, [password, passwordConfirmation]);

  useEffect(() => {
    if (!loading && isAuthenticated && !isPasswordlessUser && !registering) {
      history.push("/");
    }
  }, [history, isAuthenticated, isPasswordlessUser, registering]);

  if (loading) {
    return <LoadingView />;
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.formContainer}>
            <Logo width="auto" height="auto" className={styles.logo} />
            <h2>Create your account</h2>
            <form onSubmit={onSubmitRegisterForm}>
              <FieldRow>
                <InputField
                  type="text"
                  name="userName"
                  placeholder="Username"
                  label="Username"
                  autoCorrect="off"
                  autoCapitalize="none"
                  prefix="@"
                  suffix={`:${defaultHomeserverHost}`}
                />
              </FieldRow>
              <FieldRow>
                <InputField
                  required
                  name="password"
                  type="password"
                  onChange={(e) => setPassword(e.target.value)}
                  value={password}
                  placeholder="Password"
                  label="Password"
                />
              </FieldRow>
              <FieldRow>
                <InputField
                  required
                  type="password"
                  name="passwordConfirmation"
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  value={passwordConfirmation}
                  placeholder="Confirm Password"
                  label="Confirm Password"
                  ref={confirmPasswordRef}
                />
              </FieldRow>
              <Caption>
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
                <Link href={privacyPolicyUrl}>Terms and conditions</Link>
              </Caption>
              {error && (
                <FieldRow>
                  <ErrorMessage>{error.message}</ErrorMessage>
                </FieldRow>
              )}
              <FieldRow>
                <Button type="submit" disabled={registering}>
                  {registering ? "Registering..." : "Register"}
                </Button>
              </FieldRow>
              <div id={recaptchaId} />
            </form>
          </div>
          <div className={styles.authLinks}>
            <p>Already have an account?</p>
            <p>
              <Link to="/login">Log in</Link>
              {" Or "}
              <Link to="/">Access as a guest</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
