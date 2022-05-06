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

import React, { useState, useCallback } from "react";
import { createRoom, roomAliasFromRoomName } from "../matrix-utils";
import { useGroupCallRooms } from "./useGroupCallRooms";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import commonStyles from "./common.module.css";
import styles from "./RegisteredView.module.css";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Button } from "../button";
import { CallList } from "./CallList";
import { UserMenuContainer } from "../UserMenuContainer";
import { useModalTriggerState } from "../Modal";
import { JoinExistingCallModal } from "./JoinExistingCallModal";
import { useHistory } from "react-router-dom";
import { Headline, Title } from "../typography/Typography";
import { Form } from "../form/Form";
import { useShouldShowPtt } from "../useShouldShowPtt";

export function RegisteredView({ client }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();
  const history = useHistory();
  const shouldShowPtt = useShouldShowPtt();
  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomName = data.get("callName");
      const ptt = data.get("ptt") !== null;

      async function submit() {
        setError(undefined);
        setLoading(true);

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
    [client]
  );

  const recentRooms = useGroupCallRooms(client);

  const { modalState, modalProps } = useModalTriggerState();
  const [existingRoomId, setExistingRoomId] = useState();
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
            {shouldShowPtt && (
              <FieldRow className={styles.fieldRow}>
                <InputField
                  id="ptt"
                  name="ptt"
                  label="Push to Talk"
                  type="checkbox"
                />
              </FieldRow>
            )}
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
              <CallList rooms={recentRooms} client={client} disableFacepile />
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
