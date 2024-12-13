/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { type FC, useEffect, useState, type ReactNode, useRef } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { useTranslation } from "react-i18next";
import { CheckIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { type MatrixError } from "matrix-js-sdk/src/http-api";
import { Heading, Text } from "@vector-im/compound-web";

import { useClientLegacy } from "../ClientContext";
import { ErrorView, FullScreenView, LoadingView } from "../FullScreenView";
import { RoomAuthView } from "./RoomAuthView";
import { GroupCallView } from "./GroupCallView";
import { useRoomIdentifier, useUrlParams } from "../UrlParams";
import { useRegisterPasswordlessUser } from "../auth/useRegisterPasswordlessUser";
import { HomePage } from "../home/HomePage";
import { platform } from "../Platform";
import { AppSelectionModal } from "./AppSelectionModal";
import { widget } from "../widget";
import { CallTerminatedMessage, useLoadGroupCall } from "./useLoadGroupCall";
import { LobbyView } from "./LobbyView";
import { E2eeType } from "../e2ee/e2eeType";
import { useProfile } from "../profile/useProfile";
import { useMuteStates } from "./MuteStates";
import { useOptInAnalytics } from "../settings/settings";
import { Config } from "../config/Config";
import { Link } from "../button/Link";

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

  const groupCallState = useLoadGroupCall(client, roomIdOrAlias, viaServers);
  const muteStates = useMuteStates();

  useEffect(() => {
    // If we've finished loading, are not already authed and we've been given a display name as
    // a URL param, automatically register a passwordless user
    if (!loading && !authenticated && displayName && !widget) {
      setIsRegistering(true);
      registerPasswordlessUser(displayName)
        .catch((e) => {
          logger.error("Failed to register passwordless user", e);
        })
        .finally(() => {
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

  const [optInAnalytics, setOptInAnalytics] = useOptInAnalytics();
  useEffect(() => {
    // During the beta, opt into analytics by default
    if (optInAnalytics === null && setOptInAnalytics) setOptInAnalytics(true);
  }, [optInAnalytics, setOptInAnalytics]);

  const wasInWaitForInviteState = useRef<boolean>(false);

  useEffect(() => {
    if (groupCallState.kind === "loaded" && wasInWaitForInviteState.current) {
      logger.log("Play join sound 'Not yet implemented'");
    }
  }, [groupCallState.kind]);

  const groupCallView = (): JSX.Element => {
    switch (groupCallState.kind) {
      case "loaded":
        return (
          <GroupCallView
            widget={widget}
            client={client!}
            rtcSession={groupCallState.rtcSession}
            isPasswordlessUser={passwordlessUser}
            confineToRoom={confineToRoom}
            preload={preload}
            skipLobby={skipLobby || wasInWaitForInviteState.current}
            hideHeader={hideHeader}
            muteStates={muteStates}
          />
        );
      case "waitForInvite":
      case "canKnock": {
        wasInWaitForInviteState.current =
          wasInWaitForInviteState.current ||
          groupCallState.kind === "waitForInvite";
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
                kind: groupCallState.roomSummary["im.nheko.summary.encryption"]
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
      case "loading":
        return (
          <FullScreenView>
            <h1>{t("common.loading")}</h1>
          </FullScreenView>
        );
      case "failed":
        wasInWaitForInviteState.current = false;
        if ((groupCallState.error as MatrixError).errcode === "M_NOT_FOUND") {
          return (
            <FullScreenView>
              <Heading>{t("group_call_loader.failed_heading")}</Heading>
              <Text>{t("group_call_loader.failed_text")}</Text>
              {/* XXX: A 'create it for me' button would be the obvious UX here. Two screens already have
            dupes of this flow, let's make a common component and put it here. */}
              <Link to="/">{t("common.home")}</Link>
            </FullScreenView>
          );
        } else if (groupCallState.error instanceof CallTerminatedMessage) {
          return (
            <FullScreenView>
              <Heading>{groupCallState.error.message}</Heading>
              <Text>{groupCallState.error.messageBody}</Text>
              {groupCallState.error.reason && (
                <>
                  {t("group_call_loader.reason")}:
                  <Text size="sm">"{groupCallState.error.reason}"</Text>
                </>
              )}
              <Link to="/">{t("common.home")}</Link>
            </FullScreenView>
          );
        } else {
          return <ErrorView error={groupCallState.error} />;
        }
      default:
        return <> </>;
    }
  };

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
    content = groupCallView();
  }

  return (
    <>
      {content}
      {/* On Android and iOS, show a prompt to launch the mobile app. */}
      {appPrompt &&
        Config.get().app_prompt &&
        (platform === "android" || platform === "ios") &&
        roomId && <AppSelectionModal roomId={roomId} />}
    </>
  );
};
