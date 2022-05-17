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
import styles from "./RoomAuthView.module.css";
import { useClient } from "../ClientContext";
import { Button } from "../button";
import { Body, Caption, Link, Headline } from "../typography/Typography";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { useLocation } from "react-router-dom";
import { useRecaptcha } from "../auth/useRecaptcha";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { randomString } from "matrix-js-sdk/src/randomstring";
import { useInteractiveRegistration } from "../auth/useInteractiveRegistration";
import { Form } from "../form/Form";
import { UserMenuContainer } from "../UserMenuContainer";
import { generateRandomName } from "../auth/generateRandomName";

export function RoomAuthView() {
  const { setClient } = useClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();
  const [{ privacyPolicyUrl, recaptchaKey }, register] =
    useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const displayName = data.get("displayName");

      async function submit() {
        setError(undefined);
        setLoading(true);
        const recaptchaResponse = await execute();
        const userName = generateRandomName();
        const [client, session] = await register(
          userName,
          randomString(16),
          displayName,
          recaptchaResponse,
          true
        );
        setClient(client, session);
      }

      submit().catch((error) => {
        console.error(error);
        setLoading(false);
        setError(error);
        reset();
      });
    },
    [register, reset, execute]
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
