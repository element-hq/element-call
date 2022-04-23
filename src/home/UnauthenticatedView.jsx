import React, { useCallback, useState } from "react";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { UserMenuContainer } from "../UserMenuContainer";
import { useHistory } from "react-router-dom";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Button } from "../button";
import { randomString } from "matrix-js-sdk/src/randomstring";
import { createRoom, roomAliasFromRoomName } from "../matrix-utils";
import { useInteractiveRegistration } from "../auth/useInteractiveRegistration";
import { useModalTriggerState } from "../Modal";
import { JoinExistingCallModal } from "./JoinExistingCallModal";
import { useRecaptcha } from "../auth/useRecaptcha";
import { Body, Caption, Link, Headline } from "../typography/Typography";
import { Form } from "../form/Form";
import styles from "./UnauthenticatedView.module.css";
import commonStyles from "./common.module.css";
import { generateRandomName } from "../auth/generateRandomName";

export function UnauthenticatedView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();
  const [{ privacyPolicyUrl, recaptchaKey }, register] =
    useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);
  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomName = data.get("callName");
      const displayName = data.get("displayName");
      const ptt = data.get("ptt") !== null;

      async function submit() {
        setError(undefined);
        setLoading(true);
        const recaptchaResponse = await execute();
        const userName = generateRandomName();
        const client = await register(
          userName,
          randomString(16),
          displayName,
          recaptchaResponse,
          true
        );
        const roomIdOrAlias = await createRoom(client, roomName, ptt);

        if (roomIdOrAlias) {
          history.push(`/room/${roomIdOrAlias}`);
        }
      }

      submit().catch((error) => {
        if (error.errcode === "M_ROOM_IN_USE") {
          setExistingRoomId(roomAliasFromRoomName(roomName));
          setLoading(false);
          setError(undefined);
          modalState.open();
        } else {
          console.error(error);
          setLoading(false);
          setError(error);
          reset();
        }
      });
    },
    [register, reset, execute]
  );

  const { modalState, modalProps } = useModalTriggerState();
  const [existingRoomId, setExistingRoomId] = useState();
  const history = useHistory();
  const onJoinExistingRoom = useCallback(() => {
    history.push(`/${existingRoomId}`);
  }, [history, existingRoomId]);

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
          <Headline className={commonStyles.headline}>
            Enter a call name
          </Headline>
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow>
              <InputField
                id="callName"
                name="callName"
                label="Call name"
                placeholder="Call name"
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
            <FieldRow>
              <InputField
                id="ptt"
                name="ptt"
                label="Push to Talk"
                type="checkbox"
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
        <JoinExistingCallModal onJoin={onJoinExistingRoom} {...modalProps} />
      )}
    </>
  );
}
