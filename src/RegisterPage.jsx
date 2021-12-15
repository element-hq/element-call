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
import { useClient } from "./ConferenceCallManagerHooks";
import styles from "./LoginPage.module.css";
import { ReactComponent as Logo } from "./icons/LogoLarge.svg";

export function RegisterPage() {
  const { register } = useClient();
  const registerUsernameRef = useRef();
  const confirmPasswordRef = useRef();
  const history = useHistory();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  const onSubmitRegisterForm = useCallback(
    (e) => {
      e.preventDefault();
      setLoading(true);
      register(
        registerUsernameRef.current.value,
        registerPasswordRef.current.value
      )
        .then(() => {
          if (location.state && location.state.from) {
            history.push(location.state.from);
          } else {
            history.push("/");
          }
        })
        .catch((error) => {
          setError(error);
          setLoading(false);
        });
    },
    [register, location, history]
  );

  useEffect(() => {
    if (password && passwordConfirmation && password !== passwordConfirmation) {
      confirmPasswordRef.current.setCustomValidity("Passwords must match");
    } else {
      confirmPasswordRef.current.setCustomValidity("");
    }
  }, [password, passwordConfirmation]);

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
                  ref={registerUsernameRef}
                  placeholder="Username"
                  label="Username"
                  autoCorrect="off"
                  autoCapitalize="none"
                  prefix="@"
                  suffix={`:${window.location.host}`}
                />
              </FieldRow>
              <FieldRow>
                <InputField
                  required
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
                <Button type="submit" disabled={loading}>
                  {loading ? "Registering..." : "Register"}
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
