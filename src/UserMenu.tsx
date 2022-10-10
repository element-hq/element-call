import React, { useCallback, useMemo } from "react";
import { Item } from "@react-stately/collections";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button, LinkButton } from "./button";
import { PopoverMenuTrigger } from "./popover/PopoverMenu";
import { Menu } from "./Menu";
import { TooltipTrigger } from "./Tooltip";
import { Avatar, Size } from "./Avatar";
import { ReactComponent as UserIcon } from "./icons/User.svg";
import { ReactComponent as LoginIcon } from "./icons/Login.svg";
import { ReactComponent as LogoutIcon } from "./icons/Logout.svg";
import { Body } from "./typography/Typography";
import styles from "./UserMenu.module.css";

interface UserMenuProps {
  preventNavigation: boolean;
  isAuthenticated: boolean;
  isPasswordlessUser: boolean;
  displayName: string;
  avatarUrl: string;
  onAction: (value: string) => void;
}

export function UserMenu({
  preventNavigation,
  isAuthenticated,
  isPasswordlessUser,
  displayName,
  avatarUrl,
  onAction,
}: UserMenuProps) {
  const { t } = useTranslation();
  const location = useLocation();

  const items = useMemo(() => {
    const arr = [];

    if (isAuthenticated) {
      arr.push({
        key: "user",
        icon: UserIcon,
        label: displayName,
      });

      if (isPasswordlessUser && !preventNavigation) {
        arr.push({
          key: "login",
          label: t("Sign in"),
          icon: LoginIcon,
        });
      }

      if (!isPasswordlessUser && !preventNavigation) {
        arr.push({
          key: "logout",
          label: t("Sign out"),
          icon: LogoutIcon,
        });
      }
    }

    return arr;
  }, [isAuthenticated, isPasswordlessUser, displayName, preventNavigation, t]);

  const tooltip = useCallback(() => t("Profile"), [t]);

  if (!isAuthenticated) {
    return (
      <LinkButton to={{ pathname: "/login", state: { from: location } }}>
        Log in
      </LinkButton>
    );
  }

  return (
    <PopoverMenuTrigger placement="bottom right">
      <TooltipTrigger tooltip={tooltip} placement="bottom left">
        <Button variant="icon" className={styles.userButton}>
          {isAuthenticated && (!isPasswordlessUser || avatarUrl) ? (
            <Avatar
              size={Size.SM}
              className={styles.avatar}
              src={avatarUrl}
              fallback={displayName.slice(0, 1).toUpperCase()}
            />
          ) : (
            <UserIcon />
          )}
        </Button>
      </TooltipTrigger>
      {(props) => (
        <Menu {...props} label={t("User menu")} onAction={onAction}>
          {items.map(({ key, icon: Icon, label }) => (
            <Item key={key} textValue={label}>
              <Icon width={24} height={24} className={styles.menuIcon} />
              <Body overflowEllipsis>{label}</Body>
            </Item>
          ))}
        </Menu>
      )}
    </PopoverMenuTrigger>
  );
}
