import React, { useMemo } from "react";
import { Item } from "@react-stately/collections";
import { Button, LinkButton } from "./button";
import { PopoverMenuTrigger } from "./popover/PopoverMenu";
import { Menu } from "./Menu";
import { Tooltip, TooltipTrigger } from "./Tooltip";
import { Avatar } from "./Avatar";
import { ReactComponent as UserIcon } from "./icons/User.svg";
import { ReactComponent as LoginIcon } from "./icons/Login.svg";
import { ReactComponent as LogoutIcon } from "./icons/Logout.svg";
import styles from "./UserMenu.module.css";
import { useLocation } from "react-router-dom";
import { Body } from "./typography/Typography";

export function UserMenu({
  disableLogout,
  isAuthenticated,
  isPasswordlessUser,
  displayName,
  avatarUrl,
  onAction,
}) {
  const location = useLocation();

  const items = useMemo(() => {
    const arr = [];

    if (isAuthenticated) {
      arr.push({
        key: "user",
        icon: UserIcon,
        label: displayName,
      });

      if (isPasswordlessUser) {
        arr.push({
          key: "login",
          label: "Sign In",
          icon: LoginIcon,
        });
      }

      if (!isPasswordlessUser && !disableLogout) {
        arr.push({
          key: "logout",
          label: "Sign Out",
          icon: LogoutIcon,
        });
      }
    }

    return arr;
  }, [isAuthenticated, isPasswordlessUser, displayName, disableLogout]);

  if (!isAuthenticated) {
    return (
      <LinkButton to={{ pathname: "/login", state: { from: location } }}>
        Log in
      </LinkButton>
    );
  }

  return (
    <PopoverMenuTrigger placement="bottom right">
      <TooltipTrigger placement="bottom left">
        <Button variant="icon" className={styles.userButton}>
          {isAuthenticated && (!isPasswordlessUser || avatarUrl) ? (
            <Avatar
              size="sm"
              className={styles.avatar}
              src={avatarUrl}
              fallback={displayName.slice(0, 1).toUpperCase()}
            />
          ) : (
            <UserIcon />
          )}
        </Button>
        {() => "Profile"}
      </TooltipTrigger>
      {(props) => (
        <Menu {...props} label="User menu" onAction={onAction}>
          {items.map(({ key, icon: Icon, label }) => (
            <Item key={key} textValue={label} className={styles.menuItem}>
              <Icon width={24} height={24} className={styles.menuIcon} />
              <Body overflowEllipsis>{label}</Body>
            </Item>
          ))}
        </Menu>
      )}
    </PopoverMenuTrigger>
  );
}
