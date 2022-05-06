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

import React from "react";
import { Button } from "../button";
import { PopoverMenuTrigger } from "../popover/PopoverMenu";
import { ReactComponent as SpotlightIcon } from "../icons/Spotlight.svg";
import { ReactComponent as FreedomIcon } from "../icons/Freedom.svg";
import { ReactComponent as CheckIcon } from "../icons/Check.svg";
import styles from "./GridLayoutMenu.module.css";
import { Menu } from "../Menu";
import { Item } from "@react-stately/collections";
import { Tooltip, TooltipTrigger } from "../Tooltip";

export function GridLayoutMenu({ layout, setLayout }) {
  return (
    <PopoverMenuTrigger placement="bottom right">
      <TooltipTrigger>
        <Button variant="icon">
          {layout === "spotlight" ? <SpotlightIcon /> : <FreedomIcon />}
        </Button>
        {() => "Layout Type"}
      </TooltipTrigger>
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
