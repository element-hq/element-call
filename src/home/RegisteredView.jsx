import React from "react";
import { Link } from "react-router-dom";
import {
  useGroupCallRooms,
  usePublicRooms,
} from "../ConferenceCallManagerHooks";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import styles from "../Home.module.css";
import { FieldRow, InputField, ErrorMessage } from "../Input";
import { Button } from "../button";
import { CallList } from "../CallList";
import classNames from "classnames";
import { UserMenuContainer } from "../UserMenuContainer";

export function RegisteredView({
  client,
  isPasswordlessUser,
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
          <UserMenuContainer />
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
              {isPasswordlessUser && (
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
