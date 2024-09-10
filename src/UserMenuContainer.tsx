/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
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
