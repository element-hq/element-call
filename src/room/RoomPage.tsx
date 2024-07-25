/*
Copyright 2021-2023 New Vector Ltd

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

import { FC, useEffect, useState, useCallback, ReactNode } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { useTranslation } from "react-i18next";
import { CheckIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { useClientLegacy } from "../ClientContext";
import { ErrorView, LoadingView } from "../FullScreenView";
import { RoomAuthView } from "./RoomAuthView";
import { GroupCallLoader } from "./GroupCallLoader";
import { GroupCallView } from "./GroupCallView";
import { useRoomIdentifier, useUrlParams } from "../UrlParams";
import { useRegisterPasswordlessUser } from "../auth/useRegisterPasswordlessUser";
import { HomePage } from "../home/HomePage";
import { platform } from "../Platform";
import { AppSelectionModal } from "./AppSelectionModal";
import { widget } from "../widget";
import { GroupCallStatus } from "./useLoadGroupCall";
import { LobbyView } from "./LobbyView";
import { E2eeType } from "../e2ee/e2eeType";
import { useProfile } from "../profile/useProfile";
import { useMuteStates } from "./MuteStates";
import {
  useSetting,
  optInAnalytics as optInAnalyticsSetting,
} from "../settings/settings";

export const RoomPage: FC = () => {
  const {
    confineToRoom,
    appPrompt,
    preload,
    hideHeader,
    displayName,
    skipLobby,
  } = useUrlParams();
  const { t } = useTranslation();
  const { roomAlias, roomId, viaServers } = useRoomIdentifier();

  const roomIdOrAlias = roomId ?? roomAlias;
  if (!roomIdOrAlias) {
    logger.error("No room specified");
  }

  const { registerPasswordlessUser } = useRegisterPasswordlessUser();
  const [isRegistering, setIsRegistering] = useState(false);

  const { loading, authenticated, client, error, passwordlessUser } =
    useClientLegacy();
  const { avatarUrl, displayName: userDisplayName } = useProfile(client);

  const muteStates = useMuteStates();

  useEffect(() => {
    // If we've finished loading, are not already authed and we've been given a display name as
    // a URL param, automatically register a passwordless user
    if (!loading && !authenticated && displayName && !widget) {
      setIsRegistering(true);
      registerPasswordlessUser(displayName).finally(() => {
        setIsRegistering(false);
      });
    }
  }, [
    loading,
    authenticated,
    displayName,
    setIsRegistering,
    registerPasswordlessUser,
  ]);

  const [optInAnalytics, setOptInAnalytics] = useSetting(optInAnalyticsSetting);
  useEffect(() => {
    // During the beta, opt into analytics by default
    if (optInAnalytics === null && setOptInAnalytics) setOptInAnalytics(true);
  }, [optInAnalytics, setOptInAnalytics]);

  const groupCallView = useCallback(
    (groupCallState: GroupCallStatus): JSX.Element => {
      switch (groupCallState.kind) {
        case "loaded":
          return (
            <GroupCallView
              client={client!}
              rtcSession={groupCallState.rtcSession}
              isPasswordlessUser={passwordlessUser}
              confineToRoom={confineToRoom}
              preload={preload}
              skipLobby={skipLobby}
              hideHeader={hideHeader}
              muteStates={muteStates}
            />
          );
        case "waitForInvite":
        case "canKnock": {
          const knock =
            groupCallState.kind === "canKnock" ? groupCallState.knock : null;
          const label: string | JSX.Element =
            groupCallState.kind === "canKnock" ? (
              t("lobby.ask_to_join")
            ) : (
              <>
                {t("lobby.waiting_for_invite")}
                <CheckIcon />
              </>
            );
          return (
            <LobbyView
              client={client!}
              matrixInfo={{
                userId: client!.getUserId() ?? "",
                displayName: userDisplayName ?? "",
                avatarUrl: avatarUrl ?? "",
                roomAlias: null,
                roomId: groupCallState.roomSummary.room_id,
                roomName: groupCallState.roomSummary.name ?? "",
                roomAvatar: groupCallState.roomSummary.avatar_url ?? null,
                e2eeSystem: {
                  kind: groupCallState.roomSummary[
                    "im.nheko.summary.encryption"
                  ]
                    ? E2eeType.PER_PARTICIPANT
                    : E2eeType.NONE,
                },
              }}
              onEnter={(): void => knock?.()}
              enterLabel={label}
              waitingForInvite={groupCallState.kind === "waitForInvite"}
              confineToRoom={confineToRoom}
              hideHeader={hideHeader}
              participantCount={null}
              muteStates={muteStates}
              onShareClick={null}
            />
          );
        }
        default:
          return <> </>;
      }
    },
    [
      client,
      passwordlessUser,
      confineToRoom,
      preload,
      skipLobby,
      hideHeader,
      muteStates,
      t,
      userDisplayName,
      avatarUrl,
    ],
  );

  let content: ReactNode;
  if (loading || isRegistering) {
    content = <LoadingView />;
  } else if (error) {
    content = <ErrorView error={error} />;
  } else if (!client) {
    content = <RoomAuthView />;
  } else if (!roomIdOrAlias) {
    // TODO: This doesn't belong here, the app routes need to be reworked
    content = <HomePage />;
  } else {
    content = (
      <GroupCallLoader
        client={client}
        roomIdOrAlias={roomIdOrAlias}
        viaServers={viaServers}
      >
        {groupCallView}
      </GroupCallLoader>
    );
  }

  return (
    <>
      {content}
      {/* On Android and iOS, show a prompt to launch the mobile app. */}
      {appPrompt &&
        (platform === "android" || platform === "ios") &&
        roomId && <AppSelectionModal roomId={roomId} />}
    </>
  );
};
