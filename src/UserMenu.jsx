import React, { useCallback, useMemo } from "react";
import { Button } from "./button";
import { PopoverMenuTrigger } from "./PopoverMenu";
import { ReactComponent as UserIcon } from "./icons/User.svg";
import { ReactComponent as LoginIcon } from "./icons/Login.svg";
import { ReactComponent as LogoutIcon } from "./icons/Logout.svg";
import styles from "./UserMenu.module.css";
import { Item } from "@react-stately/collections";
import { Menu } from "./Menu";
import { useHistory, useLocation } from "react-router-dom";
import { useClient, useDisplayName } from "./ConferenceCallManagerHooks";
import { useModalTriggerState } from "./Modal";
import { ProfileModal } from "./ProfileModal";
import { Tooltip, TooltipTrigger } from "./Tooltip";

export function UserMenu() {
  const location = useLocation();
  const history = useHistory();
  const { isAuthenticated, isGuest, logout, userName, client } = useClient();
  const { displayName } = useDisplayName(client);
  const { modalState, modalProps } = useModalTriggerState();

  const onAction = useCallback(
    (value) => {
      switch (value) {
        case "user":
          modalState.open();
          break;
        case "logout":
          logout();
          break;
        case "login":
          history.push("/login", { state: { from: location } });
          break;
        case "register":
          history.push("/register", { state: { from: location } });
          break;
      }
    },
    [history, location, logout, modalState]
  );

  const items = useMemo(() => {
    const arr = [];

    if (isAuthenticated) {
      arr.push({
        key: "user",
        icon: UserIcon,
        label: displayName || userName,
      });
    }

    if (!isAuthenticated || isGuest) {
      arr.push(
        {
          key: "login",
          label: "Sign In",
          icon: LoginIcon,
        },
        {
          key: "register",
          label: "Register",
          icon: LoginIcon,
        }
      );
    } else {
      arr.push({
        key: "logout",
        label: "Sign Out",
        icon: LogoutIcon,
      });
    }

    return arr;
  }, [isAuthenticated, isGuest, userName, displayName]);

  return (
    <>
      <PopoverMenuTrigger placement="bottom right">
        <TooltipTrigger>
          <Button variant="icon" className={styles.userButton}>
            <UserIcon />
          </Button>
          {(props) => (
            <Tooltip position="bottomLeft" {...props}>
              Profile
            </Tooltip>
          )}
        </TooltipTrigger>
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
      {modalState.isOpen && <ProfileModal client={client} {...modalProps} />}
    </>
  );
}
