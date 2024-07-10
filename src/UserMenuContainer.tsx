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

import { FC, useCallback, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";

import { useClientLegacy } from "./ClientContext";
import { useProfile } from "./profile/useProfile";
import { defaultSettingsTab, SettingsModal } from "./settings/SettingsModal";
import { UserMenu } from "./UserMenu";

interface Props {
  preventNavigation?: boolean;
}

export const UserMenuContainer: FC<Props> = ({ preventNavigation = false }) => {
  const location = useLocation();
  const history = useHistory();
  const { client, logout, authenticated, passwordlessUser } = useClientLegacy();
  const { displayName, avatarUrl } = useProfile(client);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const onDismissSettingsModal = useCallback(
    () => setSettingsModalOpen(false),
    [setSettingsModalOpen],
  );

  const [settingsTab, setSettingsTab] = useState(defaultSettingsTab);

  const onAction = useCallback(
    (value: string) => {
      switch (value) {
        case "user":
          setSettingsTab("profile");
          setSettingsModalOpen(true);
          break;
        case "settings":
          setSettingsTab("audio");
          setSettingsModalOpen(true);
          break;
        case "logout":
          logout?.();
          break;
        case "login":
          history.push("/login", { state: { from: location } });
          break;
      }
    },
    [history, location, logout, setSettingsModalOpen],
  );

  const userName = client?.getUserIdLocalpart() ?? "";
  return (
    <>
      <UserMenu
        preventNavigation={preventNavigation}
        isAuthenticated={authenticated}
        isPasswordlessUser={passwordlessUser}
        avatarUrl={avatarUrl}
        onAction={onAction}
        userId={client?.getUserId() ?? ""}
        displayName={displayName || (userName ? userName.replace("@", "") : "")}
      />
      {client && (
        <SettingsModal
          client={client}
          open={settingsModalOpen}
          onDismiss={onDismissSettingsModal}
          tab={settingsTab}
          onTabChange={setSettingsTab}
        />
      )}
    </>
  );
};
