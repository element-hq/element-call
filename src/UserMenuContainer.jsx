import React, { useCallback } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useClient } from "./ClientContext";
import { useProfile } from "./useProfile";
import { useModalTriggerState } from "./Modal";
import { ProfileModal } from "./ProfileModal";
import { UserMenu } from "./UserMenu";

export function UserMenuContainer({ disableLogout }) {
  const location = useLocation();
  const history = useHistory();
  const { isAuthenticated, isPasswordlessUser, logout, userName, client } =
    useClient();
  const { displayName, avatarUrl } = useProfile(client);
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
      }
    },
    [history, location, logout, modalState]
  );

  return (
    <>
      <UserMenu
        disableLogout={disableLogout}
        isAuthenticated={isAuthenticated}
        isPasswordlessUser={isPasswordlessUser}
        avatarUrl={avatarUrl}
        onAction={onAction}
        displayName={
          displayName || (userName ? userName.replace("@", "") : undefined)
        }
      />
      {modalState.isOpen && (
        <ProfileModal
          client={client}
          isAuthenticated={isAuthenticated}
          isPasswordlessUser={isPasswordlessUser}
          {...modalProps}
        />
      )}
    </>
  );
}
