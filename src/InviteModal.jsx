import React from "react";
import { Modal, ModalContent } from "./Modal";
import { CopyButton } from "./button";
import { getRoomUrl } from "./ConferenceCallManagerHooks";

export function InviteModal({ roomId, ...rest }) {
  return (
    <Modal title="Invite People" isDismissable {...rest}>
      <ModalContent>
        <p>Copy and share this meeting link</p>
        <CopyButton value={getRoomUrl(roomId)} />
      </ModalContent>
    </Modal>
  );
}
