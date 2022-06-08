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
import { useClient } from "../ClientContext";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { UserMenuContainer } from "../UserMenuContainer";
import { useHistory } from "react-router-dom";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Button } from "../button";
import { randomString } from "matrix-js-sdk/src/randomstring";
import { createRoom, roomAliasLocalpartFromRoomName } from "../matrix-utils";
import { useInteractiveRegistration } from "../auth/useInteractiveRegistration";
import { useModalTriggerState } from "../Modal";
import { JoinExistingCallModal } from "./JoinExistingCallModal";
import { useRecaptcha } from "../auth/useRecaptcha";
import { Body, Caption, Link, Headline } from "../typography/Typography";
import { Form } from "../form/Form";
import { CallType, CallTypeDropdown } from "./CallTypeDropdown";
import styles from "./UnauthenticatedView.module.css";
import commonStyles from "./common.module.css";
import { generateRandomName } from "../auth/generateRandomName";

export function UnauthenticatedView() {
  const { setClient } = useClient();
  const [callType, setCallType] = useState(CallType.Video);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();
  const [privacyPolicyUrl, recaptchaKey, register] =
    useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const { modalState, modalProps } = useModalTriggerState();
  const [onFinished, setOnFinished] = useState();
  const history = useHistory();

  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomName = data.get("callName");
      const displayName = data.get("displayName");
      const ptt = callType === CallType.Radio;

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

        let roomIdOrAlias;
        try {
          roomIdOrAlias = await createRoom(client, roomName, ptt);
        } catch (error) {
          if (error.errcode === "M_ROOM_IN_USE") {
            setOnFinished(() => () => {
              setClient(client, session);
              const aliasLocalpart = roomAliasLocalpartFromRoomName(roomName);
              const [, serverName] = client.getUserId().split(":");
              history.push(`/room/#${aliasLocalpart}:${serverName}`);
            });

            setLoading(false);
            modalState.open();
            return;
          } else {
            throw error;
          }
        }

        // Only consider the registration successful if we managed to create the room, too
        setClient(client, session);
        history.push(`/room/${roomIdOrAlias}`);
      }

      submit().catch((error) => {
        console.error(error);
        setLoading(false);
        setError(error);
        reset();
      });
    },
    [register, reset, execute, history, callType]
  );

  const callNameLabel =
    callType === CallType.Video ? "Video call name" : "Walkie-talkie call name";

  return (
    <>
      <Header>
        <LeftNav>
          <HeaderLogo />
        </LeftNav>
        <RightNav hideMobile>
          <UserMenuContainer />
        </RightNav>
      </Header>
      <div className={commonStyles.container}>
        <main className={commonStyles.main}>
          <HeaderLogo className={commonStyles.logo} />
          <CallTypeDropdown callType={callType} setCallType={setCallType} />
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow>
              <InputField
                id="callName"
                name="callName"
                label={callNameLabel}
                placeholder={callNameLabel}
                type="text"
                required
                autoComplete="off"
              />
            </FieldRow>
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
              By clicking "Go", you agree to our{" "}
              <Link href={privacyPolicyUrl}>Terms and conditions</Link>
            </Caption>
            {error && (
              <FieldRow>
                <ErrorMessage>{error.message}</ErrorMessage>
              </FieldRow>
            )}
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? "Loading..." : "Go"}
            </Button>
            <div id={recaptchaId} />
          </Form>
        </main>
        <footer className={styles.footer}>
          <Body className={styles.mobileLoginLink}>
            <Link color="primary" to="/login">
              Login to your account
            </Link>
          </Body>
          <Body>
            Not registered yet?{" "}
            <Link color="primary" to="/register">
              Create an account
            </Link>
          </Body>
        </footer>
      </div>
      {modalState.isOpen && (
        <JoinExistingCallModal onJoin={onFinished} {...modalProps} />
      )}
    </>
  );
}
