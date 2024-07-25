/*
Copyright 2022 - 2023 New Vector Ltd

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

import { FC, MouseEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Room } from "matrix-js-sdk";
import { Button, Text } from "@vector-im/compound-web";
import {
  LinkIcon,
  CheckIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import useClipboard from "react-use-clipboard";

import { Modal } from "../Modal";
import { getAbsoluteRoomUrl } from "../matrix-utils";
import styles from "./InviteModal.module.css";
import { Toast } from "../Toast";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";

interface Props {
  room: Room;
  open: boolean;
  onDismiss: () => void;
}

export const InviteModal: FC<Props> = ({ room, open, onDismiss }) => {
  const { t } = useTranslation();
  const e2eeSystem = useRoomEncryptionSystem(room.roomId);

  const url = useMemo(
    () => getAbsoluteRoomUrl(room.roomId, e2eeSystem, room.name),
    [e2eeSystem, room.name, room.roomId],
  );
  const [, setCopied] = useClipboard(url);
  const [toastOpen, setToastOpen] = useState(false);
  const onToastDismiss = useCallback(() => setToastOpen(false), [setToastOpen]);

  const onButtonClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      setCopied();
      onDismiss();
      setToastOpen(true);
    },
    [setCopied, onDismiss],
  );

  return (
    <>
      <Modal title={t("invite_modal.title")} open={open} onDismiss={onDismiss}>
        <Text className={styles.url} size="sm" weight="semibold">
          {url}
        </Text>
        <Button
          className={styles.button}
          Icon={LinkIcon}
          onClick={onButtonClick}
          data-testid="modal_inviteLink"
        >
          {t("action.copy_link")}
        </Button>
      </Modal>
      <Toast
        open={toastOpen}
        onDismiss={onToastDismiss}
        autoDismiss={2000}
        Icon={CheckIcon}
      >
        {t("invite_modal.link_copied_toast")}
      </Toast>
    </>
  );
};
