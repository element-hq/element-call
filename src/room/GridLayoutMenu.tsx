/*
Copyright 2022 New Vector Ltd

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

import { useCallback } from "react";
import { Item } from "@react-stately/collections";
import { useTranslation } from "react-i18next";

import { Button } from "../button";
import { PopoverMenuTrigger } from "../popover/PopoverMenu";
import { ReactComponent as SpotlightIcon } from "../icons/Spotlight.svg";
import { ReactComponent as FreedomIcon } from "../icons/Freedom.svg";
import { ReactComponent as CheckIcon } from "../icons/Check.svg";
import menuStyles from "../Menu.module.css";
import { Menu } from "../Menu";
import { TooltipTrigger } from "../Tooltip";

export type Layout = "freedom" | "spotlight";

interface Props {
  layout: Layout;
  setLayout: (layout: Layout) => void;
}

export function GridLayoutMenu({ layout, setLayout }: Props) {
  const { t } = useTranslation();
  const tooltip = useCallback(() => t("Change layout"), [t]);

  return (
    <PopoverMenuTrigger placement="bottom right">
      <TooltipTrigger tooltip={tooltip}>
        <Button variant="icon">
          {layout === "spotlight" ? <SpotlightIcon /> : <FreedomIcon />}
        </Button>
      </TooltipTrigger>
      {(props: JSX.IntrinsicAttributes) => (
        <Menu
          {...props}
          label={t("Grid layout menu")}
          onAction={(key) => setLayout(key.toString() as Layout)}
          onClose={() => {}}
        >
          <Item key="freedom" textValue={t("Freedom")}>
            <FreedomIcon />
            <span>Freedom</span>
            {layout === "freedom" && (
              <CheckIcon className={menuStyles.checkIcon} />
            )}
          </Item>
          <Item key="spotlight" textValue={t("Spotlight")}>
            <SpotlightIcon />
            <span>Spotlight</span>
            {layout === "spotlight" && (
              <CheckIcon className={menuStyles.checkIcon} />
            )}
          </Item>
        </Menu>
      )}
    </PopoverMenuTrigger>
  );
}
