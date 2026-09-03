/*
Copyright 2021-2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useEffect, useState, type ReactNode, useRef } from "react";
import { type MatrixError } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { Trans, useTranslation } from "react-i18next";
import { UnknownSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { useClientLegacy } from "../ClientContext";
import { ErrorPage, FullScreenView, LoadingPage } from "../FullScreenView";
import { RoomAuthView } from "./RoomAuthView";
import { ElementCallView } from "../ElementCallView";
import { useRoomIdentifier, useUrlParams } from "../UrlParams";
import { useRegisterPasswordlessUser } from "../auth/useRegisterPasswordlessUser";
import { HomePage } from "../home/HomePage";
import { CallTerminatedMessage, useLoadGroupCall } from "./useLoadGroupCall";
import { KnockLobbyView } from "./KnockLobbyView";
import { useProfile } from "../profile/useProfile";
import { useOptInAnalytics } from "../settings/settings";
import { Link } from "../button/Link";
import { ErrorView } from "../ErrorView";

export const RoomPage: FC = (): ReactNode => {
  const urlParams = useUrlParams();
  const { confineToRoom, preload, header, displayName, skipLobby } = urlParams;
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

  useEffect(() => {
    // If we've finished loading, are not already authed and we've been given a display name as
    // a URL param, automatically register a passwordless user
    if (!loading && !authenticated && displayName && !urlParams.isWidget) {
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
    urlParams.isWidget,
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

  const groupCallView = (): ReactNode => {
    switch (groupCallState.kind) {
      case "loaded":
        return (
          <ElementCallView
            client={client!}
            rtcSession={groupCallState.rtcSession}
            isPasswordlessUser={passwordlessUser}
            confineToRoom={confineToRoom}
            preload={preload}
            skipLobby={skipLobby || wasInWaitForInviteState.current}
          />
        );
      case "waitForInvite":
      case "canKnock": {
        wasInWaitForInviteState.current =
          wasInWaitForInviteState.current ||
          groupCallState.kind === "waitForInvite";
        return (
          <KnockLobbyView
            client={client!}
            roomSummary={groupCallState.roomSummary}
            profile={{
              displayName: userDisplayName ?? "",
              avatarUrl: avatarUrl ?? "",
            }}
            knock={
              groupCallState.kind === "canKnock" ? groupCallState.knock : null
            }
            confineToRoom={confineToRoom}
            hideHeader={header !== "standard"}
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
              <ErrorView
                Icon={UnknownSolidIcon}
                title={t("error.call_not_found")}
              >
                <Trans i18nKey="error.call_not_found_description">
                  <p>
                    That link doesn't appear to belong to any existing call.
                    Check that you have the right link, or{" "}
                    <Link to="/">create a new one</Link>.
                  </p>
                </Trans>
              </ErrorView>
            </FullScreenView>
          );
        } else if (groupCallState.error instanceof CallTerminatedMessage) {
          return (
            <FullScreenView>
              <ErrorView
                Icon={groupCallState.error.icon}
                title={groupCallState.error.message}
              >
                <p>{groupCallState.error.messageBody}</p>
                {groupCallState.error.reason && (
                  <p>
                    {t("group_call_loader.reason", {
                      reason: groupCallState.error.reason,
                    })}
                  </p>
                )}
              </ErrorView>
            </FullScreenView>
          );
        } else {
          return <ErrorPage error={groupCallState.error} />;
        }
      default:
        return <> </>;
    }
  };

  if (loading || isRegistering) return <LoadingPage />;
  if (error) return <ErrorPage error={error} />;
  if (!client) return <RoomAuthView />;
  // TODO: This doesn't belong here, the app routes need to be reworked
  if (!roomIdOrAlias) return <HomePage />;
  return groupCallView();
};
