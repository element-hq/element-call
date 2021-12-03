import React from "react";
import { Overlay } from "./Overlay";
import { Modal, ModalContent } from "./Modal";
import { CopyButton } from "./CopyButton";
import { HeaderButton, ButtonTooltip } from "./RoomButton";
import { ReactComponent as AddUserIcon } from "./icons/AddUser.svg";

export function InviteModalButton({ roomUrl }) {
  return (
    <Overlay>
      <HeaderButton>
        <ButtonTooltip>Add User</ButtonTooltip>
        <AddUserIcon width={20} height={20} />
      </HeaderButton>
      {(modalProps) => (
        <Modal title="Invite People" isDismissable {...modalProps}>
          <ModalContent>
            <p>Copy and share this meeting link</p>
            <CopyButton value={roomUrl} />
          </ModalContent>
        </Modal>
      )}
    </Overlay>
  );
}
