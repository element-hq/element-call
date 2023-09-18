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

import { FC } from "react";
import { useTranslation } from "react-i18next";

import { Modal } from "../Modal";
import { CopyButton } from "../button";
import { getRoomUrl } from "../matrix-utils";
import styles from "./ShareModal.module.css";
import { useRoomSharedKey } from "../e2ee/sharedKeyManagement";

interface Props {
  roomId: string;
  open: boolean;
  onDismiss: () => void;
}

export const ShareModal: FC<Props> = ({ roomId, open, onDismiss }) => {
  const { t } = useTranslation();
  const roomSharedKey = useRoomSharedKey(roomId);

  return (
    <Modal title={t("Share this call")} open={open} onDismiss={onDismiss}>
      <p>{t("Copy and share this call link")}</p>
      <CopyButton
        className={styles.copyButton}
        value={getRoomUrl(roomId, roomSharedKey ?? undefined)}
        data-testid="modal_inviteLink"
      />
    </Modal>
  );
};
