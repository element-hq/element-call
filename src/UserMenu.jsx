import React, { useCallback, useMemo } from "react";
import { ButtonTooltip, Button } from "./button";
import { PopoverMenuTrigger } from "./PopoverMenu";
import { ReactComponent as UserIcon } from "./icons/User.svg";
import { ReactComponent as LoginIcon } from "./icons/Login.svg";
import { ReactComponent as LogoutIcon } from "./icons/Logout.svg";
import styles from "./UserMenu.module.css";
import { Item } from "@react-stately/collections";
import { Menu } from "./Menu";

export function UserMenu({ userName, signedIn, onLogin, onLogout }) {
  const onAction = useCallback((value) => {
    switch (value) {
      case "user":
        break;
      case "logout":
        onLogout();
        break;
      case "login":
        onLogin();
        break;
    }
  });

  const items = useMemo(() => {
    if (signedIn) {
      return [
        {
          key: "user",
          icon: UserIcon,
          label: userName,
        },
        {
          key: "logout",
          label: "Sign Out",
          icon: LogoutIcon,
        },
      ];
    } else {
      return [
        {
          key: "login",
          label: "Sign In",
          icon: LoginIcon,
        },
      ];
    }
  }, [signedIn, userName]);

  return (
    <PopoverMenuTrigger placement="bottom right">
      <Button variant="icon" className={styles.userButton}>
        <ButtonTooltip>Profile</ButtonTooltip>
        <UserIcon />
      </Button>
      {(props) => (
        <Menu {...props} label="User menu" onAction={onAction}>
          {items.map(({ key, icon: Icon, label }) => (
            <Item key={key} textValue={label}>
              <Icon />
              <span>{label}</span>
            </Item>
          ))}
        </Menu>
      )}
    </PopoverMenuTrigger>
  );
}
