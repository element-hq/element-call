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

import React, { useCallback, useState, useRef, useEffect } from "react";
import { useHistory, Link } from "react-router-dom";
import {
  useClient,
  useGroupCallRooms,
  usePublicRooms,
  createRoom,
  roomAliasFromRoomName,
  useInteractiveRegistration,
} from "./ConferenceCallManagerHooks";
import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import styles from "./Home.module.css";
import { FieldRow, InputField, ErrorMessage } from "./Input";
import { UserMenu } from "./UserMenu";
import { Button } from "./button";
import { CallList } from "./CallList";
import classNames from "classnames";
import { ErrorView, LoadingView } from "./FullScreenView";
import { useModalTriggerState } from "./Modal";
import { randomString } from "matrix-js-sdk/src/randomstring";
import { JoinExistingCallModal } from "./JoinExistingCallModal";

export function Home() {
  const {
    isAuthenticated,
    isGuest,
    isPasswordlessUser,
    loading,
    error,
    client,
  } = useClient();

  const [{ privacyPolicyUrl }, register] = useInteractiveRegistration();

  const history = useHistory();
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState();
  const { modalState, modalProps } = useModalTriggerState();
  const [existingRoomId, setExistingRoomId] = useState();

  const onCreateRoom = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomName = data.get("roomName");
      const userName = data.get("userName");

      async function onCreateRoom() {
        let _client = client;

        if (!_client || isGuest) {
          _client = await register(userName, randomString(16), true);
        }

        const roomIdOrAlias = await createRoom(_client, roomName);

        if (roomIdOrAlias) {
          history.push(`/room/${roomIdOrAlias}`);
        }
      }

      setCreateRoomError(undefined);
      setCreatingRoom(true);

      return onCreateRoom().catch((error) => {
        if (error.errcode === "M_ROOM_IN_USE") {
          setExistingRoomId(roomAliasFromRoomName(roomName));
          setCreateRoomError(undefined);
          modalState.open();
        } else {
          setCreateRoomError(error);
        }

        setCreatingRoom(false);
      });
    },
    [client, history, register, isGuest]
  );

  const onJoinRoom = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const roomId = data.get("roomId");
      history.push(`/${roomId}`);
    },
    [history]
  );

  const onJoinExistingRoom = useCallback(() => {
    history.push(`/${existingRoomId}`);
  }, [history, existingRoomId]);

  if (loading) {
    return <LoadingView />;
  } else if (error) {
    return <ErrorView error={error} />;
  } else {
    return (
      <>
        {!isAuthenticated || isGuest ? (
          <UnregisteredView
            onCreateRoom={onCreateRoom}
            createRoomError={createRoomError}
            creatingRoom={creatingRoom}
            onJoinRoom={onJoinRoom}
            privacyPolicyUrl={privacyPolicyUrl}
          />
        ) : (
          <RegisteredView
            client={client}
            isPasswordlessUser={isPasswordlessUser}
            isGuest={isGuest}
            onCreateRoom={onCreateRoom}
            createRoomError={createRoomError}
            creatingRoom={creatingRoom}
            onJoinRoom={onJoinRoom}
          />
        )}
        {modalState.isOpen && (
          <JoinExistingCallModal onJoin={onJoinExistingRoom} {...modalProps} />
        )}
      </>
    );
  }
}

function UnregisteredView({
  onCreateRoom,
  createRoomError,
  creatingRoom,
  onJoinRoom,
  privacyPolicyUrl,
}) {
  const acceptTermsRef = useRef();
  const [acceptTerms, setAcceptTerms] = useState(false);

  useEffect(() => {
    if (!acceptTermsRef.current) {
      return;
    }

    if (!acceptTerms) {
      acceptTermsRef.current.setCustomValidity(
        "You must accept the terms to continue."
      );
    } else {
      acceptTermsRef.current.setCustomValidity("");
    }
  }, [acceptTerms]);

  return (
    <div className={classNames(styles.home, styles.fullWidth)}>
      <Header className={styles.header}>
        <LeftNav>
          <HeaderLogo />
        </LeftNav>
        <RightNav>
          <UserMenu />
        </RightNav>
      </Header>
      <div className={styles.splitContainer}>
        <div className={styles.left}>
          <div className={styles.content}>
            <div className={styles.centered}>
              <form onSubmit={onJoinRoom}>
                <h1>Join a call</h1>
                <FieldRow className={styles.fieldRow}>
                  <InputField
                    id="roomId"
                    name="roomId"
                    label="Call ID"
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Call ID"
                  />
                </FieldRow>
                <FieldRow className={styles.fieldRow}>
                  <Button className={styles.button} type="submit">
                    Join call
                  </Button>
                </FieldRow>
              </form>
              <hr />
              <form onSubmit={onCreateRoom}>
                <h1>Create a call</h1>
                <FieldRow className={styles.fieldRow}>
                  <InputField
                    id="userName"
                    name="userName"
                    label="Username"
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Username"
                  />
                </FieldRow>
                <FieldRow className={styles.fieldRow}>
                  <InputField
                    id="roomName"
                    name="roomName"
                    label="Room Name"
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Room Name"
                  />
                </FieldRow>
                <FieldRow>
                  <InputField
                    id="acceptTerms"
                    type="checkbox"
                    name="acceptTerms"
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    checked={acceptTerms}
                    label="Accept Privacy Policy"
                    ref={acceptTermsRef}
                  />
                  <a target="_blank" href={privacyPolicyUrl}>
                    Privacy Policy
                  </a>
                </FieldRow>
                {createRoomError && (
                  <FieldRow className={styles.fieldRow}>
                    <ErrorMessage>{createRoomError.message}</ErrorMessage>
                  </FieldRow>
                )}
                <FieldRow className={styles.fieldRow}>
                  <Button
                    className={styles.button}
                    type="submit"
                    disabled={creatingRoom}
                  >
                    {creatingRoom ? "Creating call..." : "Create call"}
                  </Button>
                </FieldRow>
              </form>

              <div className={styles.authLinks}>
                <p>
                  Not registered yet?{" "}
                  <Link to="/register">Create an account</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisteredView({
  client,
  isPasswordlessUser,
  isGuest,
  onCreateRoom,
  createRoomError,
  creatingRoom,
  onJoinRoom,
}) {
  const publicRooms = usePublicRooms(
    client,
    import.meta.env.VITE_PUBLIC_SPACE_ROOM_ID
  );
  const recentRooms = useGroupCallRooms(client);

  const hideCallList = publicRooms.length === 0 && recentRooms.length === 0;

  return (
    <div
      className={classNames(styles.home, {
        [styles.fullWidth]: hideCallList,
      })}
    >
      <Header className={styles.header}>
        <LeftNav className={styles.leftNav}>
          <HeaderLogo />
        </LeftNav>
        <RightNav>
          <UserMenu />
        </RightNav>
      </Header>
      <div className={styles.splitContainer}>
        <div className={styles.left}>
          <div className={styles.content}>
            <div className={styles.centered}>
              <form onSubmit={onJoinRoom}>
                <h1>Join a call</h1>
                <FieldRow className={styles.fieldRow}>
                  <InputField
                    id="roomId"
                    name="roomId"
                    label="Call ID"
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Call ID"
                  />
                </FieldRow>
                <FieldRow className={styles.fieldRow}>
                  <Button className={styles.button} type="submit">
                    Join call
                  </Button>
                </FieldRow>
              </form>
              <hr />
              <form onSubmit={onCreateRoom}>
                <h1>Create a call</h1>
                <FieldRow className={styles.fieldRow}>
                  <InputField
                    id="roomName"
                    name="roomName"
                    label="Room Name"
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Room Name"
                  />
                </FieldRow>
                {createRoomError && (
                  <FieldRow className={styles.fieldRow}>
                    <ErrorMessage>{createRoomError.message}</ErrorMessage>
                  </FieldRow>
                )}
                <FieldRow className={styles.fieldRow}>
                  <Button
                    className={styles.button}
                    type="submit"
                    disabled={creatingRoom}
                  >
                    {creatingRoom ? "Creating call..." : "Create call"}
                  </Button>
                </FieldRow>
              </form>
              {(isPasswordlessUser || isGuest) && (
                <div className={styles.authLinks}>
                  <p>
                    Not registered yet?{" "}
                    <Link to="/register">Create an account</Link>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        {!hideCallList && (
          <div className={styles.right}>
            <div className={styles.content}>
              {publicRooms.length > 0 && (
                <CallList
                  title="Public Calls"
                  rooms={publicRooms}
                  client={client}
                />
              )}
              {recentRooms.length > 0 && (
                <CallList
                  title="Recent Calls"
                  rooms={recentRooms}
                  client={client}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
