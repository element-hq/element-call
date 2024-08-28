/*
Copyright 2022 - 2023 New Vector Ltd

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

import { FC, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem } from "@vector-im/compound-web";

import { LinkButton } from "./button";
import { Avatar, Size } from "./Avatar";
import UserIcon from "./icons/User.svg?react";
import SettingsIcon from "./icons/Settings.svg?react";
import LoginIcon from "./icons/Login.svg?react";
import LogoutIcon from "./icons/Logout.svg?react";
import styles from "./UserMenu.module.css";

interface Props {
  preventNavigation: boolean;
  isAuthenticated: boolean;
  isPasswordlessUser: boolean;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  onAction: (value: string) => void;
}

export const UserMenu: FC<Props> = ({
  preventNavigation,
  isAuthenticated,
  isPasswordlessUser,
  userId,
  displayName,
  avatarUrl,
  onAction,
}) => {
  const { t } = useTranslation();
  const location = useLocation();

  const items = useMemo(() => {
    const arr = [];

    if (isAuthenticated) {
      arr.push({
        key: "user",
        icon: UserIcon,
        label: displayName,
        dataTestid: "usermenu_user",
      });
      arr.push({
        key: "settings",
        icon: SettingsIcon,
        label: t("common.settings"),
      });

      if (isPasswordlessUser && !preventNavigation) {
        arr.push({
          key: "login",
          label: t("action.sign_in"),
          icon: LoginIcon,
          dataTestid: "usermenu_login",
        });
      }

      if (!isPasswordlessUser && !preventNavigation) {
        arr.push({
          key: "logout",
          label: t("action.sign_out"),
          icon: LogoutIcon,
          dataTestid: "usermenu_logout",
        });
      }
    }

    return arr;
  }, [isAuthenticated, isPasswordlessUser, displayName, preventNavigation, t]);

  const [open, setOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <LinkButton to={{ pathname: "/login", state: { from: location } }}>
        {t("log_in")}
      </LinkButton>
    );
  }

  return (
    <Menu
      title={t("a11y.user_menu")}
      showTitle={false}
      align="end"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          aria-label={t("common.profile")}
          className={styles.userButton}
          data-testid="usermenu_open"
        >
          {isAuthenticated && (!isPasswordlessUser || avatarUrl) ? (
            <Avatar
              id={userId}
              name={displayName}
              size={Size.SM}
              src={avatarUrl}
            />
          ) : (
            <UserIcon />
          )}
        </button>
      }
    >
      {items.map(({ key, icon: Icon, label, dataTestid }) => (
        <MenuItem
          key={key}
          Icon={Icon}
          label={label}
          data-test-id={dataTestid}
          onSelect={() => onAction(key)}
        />
      ))}
    </Menu>
  );
};
