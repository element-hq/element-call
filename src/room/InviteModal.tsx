/*
Copyright 2022 New Vector Ltd

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

import React, { FC } from "react";
import { useTranslation } from "react-i18next";

import { Modal, ModalContent, ModalProps } from "../Modal";
import { CopyButton } from "../button";
import { getRoomUrl } from "../matrix-utils";
import styles from "./InviteModal.module.css";

interface Props extends Omit<ModalProps, "title" | "children"> {
  roomIdOrAlias: string;
}

export const InviteModal: FC<Props> = ({ roomIdOrAlias, ...rest }) => {
  const { t } = useTranslation();

  return (
    <Modal
      title={t("Invite people")}
      isDismissable
      className={styles.inviteModal}
      {...rest}
    >
      <ModalContent>
        <p>{t("Copy and share this call link")}</p>
        <CopyButton
          className={styles.copyButton}
          value={getRoomUrl(roomIdOrAlias)}
          data-testid="modal_inviteLink"
        />
      </ModalContent>
    </Modal>
  );
};
