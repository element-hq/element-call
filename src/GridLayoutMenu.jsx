import React, { useCallback } from "react";
import { ButtonTooltip, HeaderButton } from "./RoomButton";
import { Popover, PopoverMenu, PopoverMenuItem } from "./PopoverMenu";
import { ReactComponent as SpotlightIcon } from "./icons/Spotlight.svg";
import { ReactComponent as FreedomIcon } from "./icons/Freedom.svg";
import { ReactComponent as CheckIcon } from "./icons/Check.svg";
import styles from "./GridLayoutMenu.module.css";

export function GridLayoutMenu({ layout, setLayout }) {
  const onAction = useCallback((value) => setLayout(value));

  return (
    <PopoverMenu onAction={onAction} placement="bottom right">
      <HeaderButton>
        <ButtonTooltip>Layout Type</ButtonTooltip>
        {layout === "spotlight" ? <SpotlightIcon /> : <FreedomIcon />}
      </HeaderButton>
      {(props) => (
        <Popover {...props} label="Grid layout menu">
          <PopoverMenuItem key="freedom" textValue="Freedom">
            <FreedomIcon />
            <span>Freedom</span>
            {layout === "freedom" && <CheckIcon className={styles.checkIcon} />}
          </PopoverMenuItem>
          <PopoverMenuItem key="spotlight" textValue="Spotlight">
            <SpotlightIcon />
            <span>Spotlight</span>
            {layout === "spotlight" && (
              <CheckIcon className={styles.checkIcon} />
            )}
          </PopoverMenuItem>
        </Popover>
      )}
    </PopoverMenu>
  );
}
