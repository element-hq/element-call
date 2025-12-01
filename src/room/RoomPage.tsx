/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  useEffect,
  useState,
  type ReactNode,
  useRef,
  type JSX,
} from "react";
import { type MatrixError } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { Trans, useTranslation } from "react-i18next";
import {
  CheckIcon,
  UnknownSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { useObservable } from "observable-hooks";
import { map } from "rxjs";

import { useClientLegacy } from "../ClientContext";
import { ErrorPage, FullScreenView, LoadingPage } from "../FullScreenView";
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
import { useOptInAnalytics } from "../settings/settings";
import { Config } from "../config/Config";
import { Link } from "../button/Link";
import { ErrorView } from "../ErrorView";
import { useMediaDevices } from "../MediaDevicesContext";
import { MuteStates } from "../state/MuteStates";
import { ObservableScope } from "../state/ObservableScope";

export const RoomPage: FC = () => {
  const { confineToRoom, appPrompt, preload, header, displayName, skipLobby } =
    useUrlParams();
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
  const [joined, setJoined] = useState(false);

  const devices = useMediaDevices();
  const [muteStates, setMuteStates] = useState<MuteStates | null>(null);
  const joined$ = useObservable(
    (inputs$) => inputs$.pipe(map(([joined]) => joined)),
    [joined],
  );
  useEffect(() => {
    const scope = new ObservableScope();
    setMuteStates(new MuteStates(scope, devices, joined$));
    return (): void => scope.end();
  }, [devices, joined$]);

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

  const groupCallView = (): ReactNode => {
    switch (groupCallState.kind) {
      case "loaded":
        return (
          muteStates && (
            <GroupCallView
              widget={widget}
              client={client!}
              rtcSession={groupCallState.rtcSession}
              joined={joined}
              setJoined={setJoined}
              isPasswordlessUser={passwordlessUser}
              confineToRoom={confineToRoom}
              preload={preload}
              skipLobby={skipLobby || wasInWaitForInviteState.current}
              header={header}
              muteStates={muteStates}
            />
          )
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
          muteStates && (
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
              hideHeader={header !== "standard"}
              participantCount={null}
              muteStates={muteStates}
              onShareClick={null}
            />
          )
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
                widget={widget}
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
                widget={widget}
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
          return <ErrorPage widget={widget} error={groupCallState.error} />;
        }
      default:
        return <> </>;
    }
  };

  let content: ReactNode;
  if (loading || isRegistering) {
    content = <LoadingPage />;
  } else if (error) {
    content = <ErrorPage widget={widget} error={error} />;
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
