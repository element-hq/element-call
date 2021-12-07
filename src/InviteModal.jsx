import React from "react";
import { Modal, ModalContent } from "./Modal";
import { CopyButton } from "./button";

export function InviteModal({ roomUrl, ...rest }) {
  return (
    <Modal title="Invite People" isDismissable {...rest}>
      <ModalContent>
        <p>Copy and share this meeting link</p>
        <CopyButton value={roomUrl} />
      </ModalContent>
    </Modal>
  );
}
