import React, { useCallback } from "react";
import { ButtonTooltip, RoomButton } from "./RoomButton";
import { Popover, PopoverMenu, PopoverMenuItem } from "./PopoverMenu";
import { ReactComponent as SettingsIcon } from "./icons/Settings.svg";
import { ReactComponent as AddUserIcon } from "./icons/AddUser.svg";
import { ReactComponent as OverflowIcon } from "./icons/Overflow.svg";

export function OverflowMenu({ roomUrl }) {
  const onAction = useCallback((e) => console.log(e));

  return (
    <PopoverMenu onAction={onAction}>
      <RoomButton>
        <ButtonTooltip>More</ButtonTooltip>
        <OverflowIcon />
      </RoomButton>
      {(props) => (
        <Popover {...props} label="More menu">
          <PopoverMenuItem key="invite" textValue="Invite people">
            <AddUserIcon />
            <span>Invite people</span>
          </PopoverMenuItem>
          <PopoverMenuItem key="settings" textValue="Settings">
            <SettingsIcon />
            <span>Settings</span>
          </PopoverMenuItem>
        </Popover>
      )}
    </PopoverMenu>
  );
}
