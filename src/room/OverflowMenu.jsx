/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import React, { useCallback } from "react";
import { Button } from "../button";
import { Menu } from "../Menu";
import { PopoverMenuTrigger } from "../popover/PopoverMenu";
import { Item } from "@react-stately/collections";
import { ReactComponent as SettingsIcon } from "../icons/Settings.svg";
import { ReactComponent as AddUserIcon } from "../icons/AddUser.svg";
import { ReactComponent as OverflowIcon } from "../icons/Overflow.svg";
import { ReactComponent as FeedbackIcon } from "../icons/Feedback.svg";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { InviteModal } from "./InviteModal";
import { TooltipTrigger } from "../Tooltip";
import { FeedbackModal } from "./FeedbackModal";

export function OverflowMenu({
  roomId,
  setShowInspector,
  showInspector,
  inCall,
  groupCall,
  showInvite,
  feedbackModalState,
  feedbackModalProps,
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
            {showInvite && (
              <Item key="invite" textValue="Invite people">
                <AddUserIcon />
                <span>Invite people</span>
              </Item>
            )}
            <Item key="settings" textValue="Settings">
              <SettingsIcon />
              <span>Settings</span>
            </Item>
            <Item key="feedback" textValue="Submit Feedback">
              <FeedbackIcon />
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
