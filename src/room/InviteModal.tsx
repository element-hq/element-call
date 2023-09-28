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
import LinkIcon from "@vector-im/compound-design-tokens/icons/link.svg?react";
import CheckIcon from "@vector-im/compound-design-tokens/icons/check.svg?react";
import useClipboard from "react-use-clipboard";

import { Modal } from "../Modal";
import { getAbsoluteRoomUrl } from "../matrix-utils";
import styles from "./InviteModal.module.css";
import { useRoomSharedKey } from "../e2ee/sharedKeyManagement";
import { Toast } from "../Toast";

interface Props {
  room: Room;
  open: boolean;
  onDismiss: () => void;
}

export const InviteModal: FC<Props> = ({ room, open, onDismiss }) => {
  const { t } = useTranslation();
  const roomSharedKey = useRoomSharedKey(room.roomId);
  const url = useMemo(
    () =>
      getAbsoluteRoomUrl(room.roomId, room.name, roomSharedKey ?? undefined),
    [room, roomSharedKey]
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
    [setCopied, onDismiss]
  );

  return (
    <>
      <Modal title={t("Invite to this call")} open={open} onDismiss={onDismiss}>
        <Text className={styles.url} size="sm" weight="semibold">
          {url}
        </Text>
        <Button
          className={styles.button}
          Icon={LinkIcon}
          onClick={onButtonClick}
          data-testid="modal_inviteLink"
        >
          {t("Copy link")}
        </Button>
      </Modal>
      <Toast
        open={toastOpen}
        onDismiss={onToastDismiss}
        autoDismiss={2000}
        Icon={CheckIcon}
      >
        {t("Link copied to clipboard")}
      </Toast>
    </>
  );
};
