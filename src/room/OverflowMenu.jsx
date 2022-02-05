import React, { useCallback } from "react";
import { Button } from "../button";
import { Menu } from "../Menu";
import { PopoverMenuTrigger } from "../popover/PopoverMenu";
import { Item } from "@react-stately/collections";
import { ReactComponent as SettingsIcon } from "../icons/Settings.svg";
import { ReactComponent as AddUserIcon } from "../icons/AddUser.svg";
import { ReactComponent as OverflowIcon } from "../icons/Overflow.svg";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { InviteModal } from "./InviteModal";
import { TooltipTrigger } from "../Tooltip";
import { FeedbackModal } from "./FeedbackModal";

export function OverflowMenu({
  roomId,
  setShowInspector,
  showInspector,
  client,
  inCall,
  groupCall,
}) {
  const { modalState: inviteModalState, modalProps: inviteModalProps } =
    useModalTriggerState();
  const { modalState: settingsModalState, modalProps: settingsModalProps } =
    useModalTriggerState();
  const { modalState: feedbackModalState, modalProps: feedbackModalProps } =
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
      case "feedback":
        feedbackModalState.open();
        break;
    }
  });

  return (
    <>
      <PopoverMenuTrigger disableOnState>
        <TooltipTrigger placement="top">
          <Button variant="toolbar">
            <OverflowIcon />
          </Button>
          {() => "More"}
        </TooltipTrigger>
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
            <Item key="feedback" textValue="Submit Feedback">
              <SettingsIcon />
              <span>Submit Feedback</span>
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
        <InviteModal roomId={roomId} {...inviteModalProps} />
      )}
      {feedbackModalState.isOpen && (
        <FeedbackModal
          {...feedbackModalProps}
          roomId={groupCall?.room.roomId}
          inCall={inCall}
        />
      )}
    </>
  );
}
