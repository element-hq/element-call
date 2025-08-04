/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { logger } from "matrix-js-sdk/lib/logger";

import { useClientLegacy } from "./ClientContext";
import { useProfile } from "./profile/useProfile";
import { defaultSettingsTab, SettingsModal } from "./settings/SettingsModal";
import { UserMenu } from "./UserMenu";

interface Props {
  preventNavigation?: boolean;
}

export const UserMenuContainer: FC<Props> = ({ preventNavigation = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
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
          navigate("/login", { state: { from: location } })?.catch((error) =>
            logger.error("Failed to navigate to login", error),
          );
          break;
      }
    },
    [navigate, location, logout, setSettingsModalOpen],
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
