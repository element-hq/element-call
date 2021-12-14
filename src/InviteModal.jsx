import React from "react";
import { Modal, ModalContent } from "./Modal";
import { CopyButton } from "./button";
import { getRoomUrl } from "./ConferenceCallManagerHooks";
import styles from "./InviteModal.module.css";

export function InviteModal({ roomId, ...rest }) {
  return (
    <Modal
      title="Invite People"
      isDismissable
      className={styles.inviteModal}
      {...rest}
    >
      <ModalContent>
        <p>Copy and share this meeting link</p>
        <CopyButton className={styles.copyButton} value={getRoomUrl(roomId)} />
      </ModalContent>
    </Modal>
  );
}
