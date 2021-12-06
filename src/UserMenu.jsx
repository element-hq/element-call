import React, { useCallback, useMemo } from "react";
import { ButtonTooltip, HeaderButton } from "./RoomButton";
import { Popover, PopoverMenu, PopoverMenuItem } from "./PopoverMenu";
import { ReactComponent as UserIcon } from "./icons/User.svg";
import { ReactComponent as LoginIcon } from "./icons/Login.svg";
import { ReactComponent as LogoutIcon } from "./icons/Logout.svg";
import styles from "./UserMenu.module.css";

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
    <PopoverMenu onAction={onAction} placement="bottom right">
      <HeaderButton className={styles.userButton}>
        <ButtonTooltip>Profile</ButtonTooltip>
        <UserIcon />
      </HeaderButton>
      {(props) => (
        <Popover {...props} label="User menu">
          {items.map(({ key, icon: Icon, label }) => (
            <PopoverMenuItem key={key} textValue={label}>
              <Icon />
              <span>{label}</span>
            </PopoverMenuItem>
          ))}
        </Popover>
      )}
    </PopoverMenu>
  );
}
