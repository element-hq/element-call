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
import { useHistory, useLocation, Link } from "react-router-dom";
import { FieldRow, InputField, ErrorMessage } from "./Input";
import { Button } from "./button";
import { useClient, defaultHomeserverHost } from "./ConferenceCallManagerHooks";
import styles from "./LoginPage.module.css";
import { ReactComponent as Logo } from "./icons/LogoLarge.svg";
import { LoadingView } from "./FullScreenView";

export function RegisterPage() {
  const {
    loading,
    client,
    register,
    changePassword,
    isAuthenticated,
    isPasswordlessUser,
  } = useClient();
  const confirmPasswordRef = useRef();
  const history = useHistory();
  const location = useLocation();
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

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

      setRegistering(true);

      console.log(isPasswordlessUser);

      if (isPasswordlessUser) {
        changePassword(password)
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
          });
      } else {
        register(userName, password)
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
          });
      }
    },
    [register, changePassword, location, history, isPasswordlessUser]
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
    if (!loading && isAuthenticated && !isPasswordlessUser) {
      history.push("/");
    }
  }, [history, isAuthenticated, isPasswordlessUser]);

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
                  value={
                    isAuthenticated && isPasswordlessUser
                      ? client.getUserIdLocalpart()
                      : undefined
                  }
                  disabled={isAuthenticated && isPasswordlessUser}
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
