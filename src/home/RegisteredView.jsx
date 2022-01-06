import React, { useState, useCallback } from "react";
import {
  createRoom,
  useGroupCallRooms,
  roomAliasFromRoomName,
} from "../ConferenceCallManagerHooks";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import commonStyles from "./common.module.css";
import styles from "./RegisteredView.module.css";
import { FieldRow, InputField, ErrorMessage } from "../Input";
import { Button } from "../button";
import { CallList } from "./CallList";
import { UserMenuContainer } from "../UserMenuContainer";
import { useModalTriggerState } from "../Modal";
import { JoinExistingCallModal } from "./JoinExistingCallModal";
import { useHistory } from "react-router-dom";
import { Headline, Title } from "../typography/Typography";
import { Form } from "../form/Form";

export function RegisteredView({ client }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();
  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomName = data.get("callName");

      async function submit() {
        setError(undefined);
        setLoading(true);

        const roomIdOrAlias = await createRoom(client, roomName);

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
    [client]
  );

  const recentRooms = useGroupCallRooms(client);

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
        <RightNav>
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
            <FieldRow className={styles.fieldRow}>
              <InputField
                id="callName"
                name="callName"
                label="Call name"
                placeholder="Call name"
                type="text"
                required
                autoComplete="off"
              />
              <Button
                type="submit"
                size="lg"
                className={styles.button}
                disabled={loading}
              >
                {loading ? "Loading..." : "Go"}
              </Button>
            </FieldRow>
            {error && (
              <FieldRow className={styles.fieldRow}>
                <ErrorMessage>{error.message}</ErrorMessage>
              </FieldRow>
            )}
          </Form>
          {recentRooms.length > 0 && (
            <>
              <Title className={styles.recentCallsTitle}>
                Your recent Calls
              </Title>
              <CallList rooms={recentRooms} client={client} />
            </>
          )}
        </main>
      </div>
      {modalState.isOpen && (
        <JoinExistingCallModal onJoin={onJoinExistingRoom} {...modalProps} />
      )}
    </>
  );
}
