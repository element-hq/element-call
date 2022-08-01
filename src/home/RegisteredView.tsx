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

import React, {
  useState,
  useCallback,
  FormEvent,
  FormEventHandler,
} from "react";
import { useHistory } from "react-router-dom";
import { MatrixClient } from "matrix-js-sdk";

import { createRoom, roomAliasLocalpartFromRoomName } from "../matrix-utils";
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
import { Title } from "../typography/Typography";
import { Form } from "../form/Form";
import { CallType, CallTypeDropdown } from "./CallTypeDropdown";

interface Props {
  client: MatrixClient;
  isPasswordlessUser: boolean;
}

export function RegisteredView({ client, isPasswordlessUser }: Props) {
  const [callType, setCallType] = useState(CallType.Video);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const history = useHistory();
  const { modalState, modalProps } = useModalTriggerState();

  const onSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const data = new FormData(e.target as HTMLFormElement);
      const roomNameData = data.get("callName");
      const roomName = typeof roomNameData === "string" ? roomNameData : "";
      // const ptt = callType === CallType.Radio;

      async function submit() {
        setError(undefined);
        setLoading(true);

        const [roomIdOrAlias] = await createRoom(client, roomName);

        if (roomIdOrAlias) {
          history.push(`/room/${roomIdOrAlias}`);
        }
      }

      submit().catch((error) => {
        if (error.errcode === "M_ROOM_IN_USE") {
          setExistingRoomId(roomAliasLocalpartFromRoomName(roomName));
          setLoading(false);
          setError(undefined);
          modalState.open();
        } else {
          console.error(error);
          setLoading(false);
          setError(error);
        }
      });
    },
    [client, history, modalState]
  );

  const recentRooms = useGroupCallRooms(client);

  const [existingRoomId, setExistingRoomId] = useState<string>();
  const onJoinExistingRoom = useCallback(() => {
    history.push(`/${existingRoomId}`);
  }, [history, existingRoomId]);

  const callNameLabel =
    callType === CallType.Video ? "Video call name" : "Walkie-talkie call name";

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
          <CallTypeDropdown callType={callType} setCallType={setCallType} />
          <Form className={styles.form} onSubmit={onSubmit}>
            <FieldRow className={styles.fieldRow}>
              <InputField
                id="callName"
                name="callName"
                label={callNameLabel}
                placeholder={callNameLabel}
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
