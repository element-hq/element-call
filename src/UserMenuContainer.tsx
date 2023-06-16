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

import React, { useCallback, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";

import { useClient } from "./ClientContext";
import { useProfile } from "./profile/useProfile";
import { useModalTriggerState } from "./Modal";
import { SettingsModal } from "./settings/SettingsModal";
import { UserMenu } from "./UserMenu";

interface Props {
  preventNavigation?: boolean;
}

export function UserMenuContainer({ preventNavigation = false }: Props) {
  const location = useLocation();
  const history = useHistory();
  const { isAuthenticated, isPasswordlessUser, logout, userName, client } =
    useClient();
  const { displayName, avatarUrl } = useProfile(client);
  const { modalState, modalProps } = useModalTriggerState();

  const [defaultSettingsTab, setDefaultSettingsTab] = useState<string>();

  const onAction = useCallback(
    async (value: string) => {
      switch (value) {
        case "user":
          setDefaultSettingsTab("profile");
          modalState.open();
          break;
        case "settings":
          setDefaultSettingsTab("audio");
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
        preventNavigation={preventNavigation}
        isAuthenticated={isAuthenticated}
        isPasswordlessUser={isPasswordlessUser}
        avatarUrl={avatarUrl}
        onAction={onAction}
        displayName={
          displayName || (userName ? userName.replace("@", "") : undefined)
        }
      />
      {modalState.isOpen && (
        <SettingsModal
          client={client}
          defaultTab={defaultSettingsTab}
          {...modalProps}
        />
      )}
    </>
  );
}
