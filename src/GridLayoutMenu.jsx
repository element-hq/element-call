import React from "react";
import { ButtonTooltip, Button } from "./button";
import { PopoverMenuTrigger } from "./PopoverMenu";
import { ReactComponent as SpotlightIcon } from "./icons/Spotlight.svg";
import { ReactComponent as FreedomIcon } from "./icons/Freedom.svg";
import { ReactComponent as CheckIcon } from "./icons/Check.svg";
import styles from "./GridLayoutMenu.module.css";
import { Menu } from "./Menu";
import { Item } from "@react-stately/collections";

export function GridLayoutMenu({ layout, setLayout }) {
  return (
    <PopoverMenuTrigger placement="bottom right">
      <Button variant="icon">
        <ButtonTooltip>Layout Type</ButtonTooltip>
        {layout === "spotlight" ? <SpotlightIcon /> : <FreedomIcon />}
      </Button>
      {(props) => (
        <Menu {...props} label="Grid layout menu" onAction={setLayout}>
          <Item key="freedom" textValue="Freedom">
            <FreedomIcon />
            <span>Freedom</span>
            {layout === "freedom" && <CheckIcon className={styles.checkIcon} />}
          </Item>
          <Item key="spotlight" textValue="Spotlight">
            <SpotlightIcon />
            <span>Spotlight</span>
            {layout === "spotlight" && (
              <CheckIcon className={styles.checkIcon} />
            )}
          </Item>
        </Menu>
      )}
    </PopoverMenuTrigger>
  );
}
