/*
Copyright 2023 Šimon Brandner <simon.bra.ag@gmail.com>

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

import { ChangeEvent, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MatrixClient } from "matrix-js-sdk";
import { BreakoutRoomBase } from "matrix-js-sdk/src/@types/breakout";
import { NewBreakoutRoom } from "matrix-js-sdk/src/@types/breakout";

import { Modal } from "../Modal";
import { Button, RemoveButton } from "../button/Button";
import { FieldRow, InputField } from "../input/Input";
import { arrayFastClone } from "../utils";
import styles from "./BreakoutRoomModal.module.css";

interface BreakoutRoom extends BreakoutRoomBase {
  roomName: string;
  roomId?: string;
}

interface BreakoutRoomRowProps {
  index: number;
  roomName: string;
  users: string[];
  onRoomNameChanged: (index: number, newRoomName: string) => void;
  onUsersChanged: (index: number, newUsers: string[]) => void;
  onRemove: (index: number) => void;
}

const BreakoutRoomRow = ({
  index,
  roomName,
  users,
  onRoomNameChanged,
  onUsersChanged,
  onRemove,
}: BreakoutRoomRowProps) => {
  const { t } = useTranslation();

  const onRoomNameFieldChange = useCallback(
    (ev: ChangeEvent<HTMLInputElement>) => {
      onRoomNameChanged(index, ev.currentTarget.value);
    },
    [onRoomNameChanged, index]
  );

  const onRemoveClick = useCallback(() => {
    onRemove(index);
  }, [onRemove, index]);

  return (
    <FieldRow className={styles.breakoutRoomNameFieldRow}>
      <InputField
        className={styles.breakoutRoomNameField}
        id="roomName"
        name="roomName"
        label={t("Room name")}
        placeholder={t("Room name")}
        type="text"
        onChange={onRoomNameFieldChange}
        value={roomName}
      />
      <RemoveButton onPress={onRemoveClick} />
    </FieldRow>
  );
};

interface Props {
  client: MatrixClient;
  roomId: string;
  open: boolean;
  onDismiss: () => void;
}

export const BreakoutRoomModal = ({
  client,
  roomId,
  open,
  onDismiss,
}: Props) => {
  const { t } = useTranslation();

  const [submitting, setSubmitting] = useState(false);
  const [breakoutRooms, setBreakoutRooms] = useState<BreakoutRoom[]>(() => [
    { roomName: t("Break-out room 1"), users: [] },
    { roomName: t("Break-out room 2"), users: [] },
  ]);

  const onRoomNameChanged = useCallback(
    (index: number, newRoomName: string) => {
      const rooms = arrayFastClone(breakoutRooms);
      rooms[index].roomName = newRoomName;
      setBreakoutRooms(rooms);
    },
    [breakoutRooms, setBreakoutRooms]
  );

  const onUsersChanged = useCallback(
    (index: number, newUsers: string[]) => {
      const rooms = arrayFastClone(breakoutRooms);
      rooms[index].users = newUsers;
      setBreakoutRooms(rooms);
    },
    [breakoutRooms, setBreakoutRooms]
  );

  const onRemoveRoom = useCallback(
    (index: number) => {
      const rooms = arrayFastClone(breakoutRooms);
      rooms.splice(index, 1);
      setBreakoutRooms(rooms);
    },
    [breakoutRooms, setBreakoutRooms]
  );

  const onAddBreakoutRoom = useCallback(() => {
    const rooms = arrayFastClone(breakoutRooms);
    rooms.push({ roomName: "", users: [] } as NewBreakoutRoom);
    setBreakoutRooms(rooms);
  }, [breakoutRooms, setBreakoutRooms]);

  const onSubmit = useCallback(async () => {
    setSubmitting(true);
    await client.createBreakoutRooms(roomId, breakoutRooms);
    onDismiss();
  }, [client, roomId, breakoutRooms, onDismiss]);

  return (
    <Modal title={t("Break-out room")} open={open} onDismiss={onDismiss}>
      <div className={styles.breakoutRooms}>
        {breakoutRooms.map((r, index) => (
          <BreakoutRoomRow
            key={index}
            index={index}
            roomName={r.roomName}
            users={r.users}
            onRoomNameChanged={onRoomNameChanged}
            onUsersChanged={onUsersChanged}
            onRemove={onRemoveRoom}
          />
        ))}
      </div>
      <div className={styles.breakoutRoomsButtons}>
        <Button type="submit" onPress={onAddBreakoutRoom}>
          {t("Add break-out room")}
        </Button>
        <Button type="submit" disabled={submitting} onPress={onSubmit}>
          {submitting ? t("Creating rooms...") : t("Create rooms")}
        </Button>
      </div>
    </Modal>
  );
};
