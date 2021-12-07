import React, { useCallback } from "react";
import { ButtonTooltip, RoomButton } from "./RoomButton";
import { Menu } from "./Menu";
import { PopoverMenuTrigger } from "./PopoverMenu";
import { Item } from "@react-stately/collections";
import { ReactComponent as SettingsIcon } from "./icons/Settings.svg";
import { ReactComponent as AddUserIcon } from "./icons/AddUser.svg";
import { ReactComponent as OverflowIcon } from "./icons/Overflow.svg";
import { useModalTriggerState } from "./Modal";
import { SettingsModal } from "./SettingsModal";
import { InviteModal } from "./InviteModal";

export function OverflowMenu({
  roomUrl,
  setShowInspector,
  showInspector,
  client,
}) {
  const { modalState: inviteModalState, modalProps: inviteModalProps } =
    useModalTriggerState();
  const { modalState: settingsModalState, modalProps: settingsModalProps } =
    useModalTriggerState();

  // TODO: On closing modal, focus should be restored to the trigger button
  // https://github.com/adobe/react-spectrum/issues/2444
  const onAction = useCallback((key) => {
    switch (key) {
      case "invite":
        inviteModalState.open();
        break;
      case "settings":
        settingsModalState.open();
        break;
    }
  });

  return (
    <>
      <PopoverMenuTrigger>
        <RoomButton>
          <ButtonTooltip>More</ButtonTooltip>
          <OverflowIcon />
        </RoomButton>
        {(props) => (
          <Menu {...props} label="More menu" onAction={onAction}>
            <Item key="invite" textValue="Invite people">
              <AddUserIcon />
              <span>Invite people</span>
            </Item>
            <Item key="settings" textValue="Settings">
              <SettingsIcon />
              <span>Settings</span>
            </Item>
          </Menu>
        )}
      </PopoverMenuTrigger>
      {settingsModalState.isOpen && (
        <SettingsModal
          {...settingsModalProps}
          setShowInspector={setShowInspector}
          showInspector={showInspector}
          client={client}
        />
      )}
      {inviteModalState.isOpen && (
        <InviteModal roomUrl={roomUrl} {...inviteModalProps} />
      )}
    </>
  );
}
