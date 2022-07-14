/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

  function isString(formData: FormDataEntryValue): formData is string {
    return typeof formData === "string";
  }
  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const dataForDisplayName = data.get("displayName");
      const displayName = isString(dataForDisplayName)
        ? dataForDisplayName
        : "";

      registerPasswordlessUser(displayName).catch((error) => {
        console.error("Failed to register passwordless user", e);
        setLoading(false);
        setError(error);
      });
    },
    [registerPasswordlessUser]
  );

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
          <Headline className={styles.headline}>Join Call</Headline>
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow>
              <InputField
                id="displayName"
                name="displayName"
                label="Display Name"
                placeholder="Display Name"
                type="text"
                required
                autoComplete="off"
              />
            </FieldRow>
            <Caption>
              By clicking "Join call now", you agree to our{" "}
              <Link href={privacyPolicyUrl}>Terms and conditions</Link>
            </Caption>
            {error && (
              <FieldRow>
                <ErrorMessage>{error.message}</ErrorMessage>
              </FieldRow>
            )}
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "Loading..." : "Join call now"}
            </Button>
            <div id={recaptchaId} />
          </Form>
        </main>
        <Body className={styles.footer}>
          {"Not registered yet? "}
          <Link
            color="primary"
            to={{ pathname: "/login", state: { from: location } }}
          >
            Create an account
          </Link>
        </Body>
      </div>
    </>
  );
}
