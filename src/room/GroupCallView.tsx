/*
Copyright 2022 New Vector Ltd

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

import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { MatrixClient } from "matrix-js-sdk/src/client";
import {
  Room,
  isE2EESupported as isE2EESupportedBrowser,
} from "livekit-client";
import { logger } from "matrix-js-sdk/src/logger";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { JoinRule } from "matrix-js-sdk/src/matrix";
import { Heading, Link, Text } from "@vector-im/compound-web";
import { useTranslation } from "react-i18next";

import type { IWidgetApiRequest } from "matrix-widget-api";
import { widget, ElementWidgetActions, JoinCallData } from "../widget";
import { FullScreenView } from "../FullScreenView";
import { LobbyView } from "./LobbyView";
import { MatrixInfo } from "./VideoPreview";
import { CallEndedView } from "./CallEndedView";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { useProfile } from "../profile/useProfile";
import { findDeviceByName } from "../media-utils";
import { ActiveCall } from "./InCallView";
import { MUTE_PARTICIPANT_COUNT, MuteStates } from "./MuteStates";
import { useMediaDevices, MediaDevices } from "../livekit/MediaDevicesContext";
import { useMatrixRTCSessionMemberships } from "../useMatrixRTCSessionMemberships";
import { enterRTCSession, leaveRTCSession } from "../rtcSessionHelpers";
import { useMatrixRTCSessionJoinState } from "../useMatrixRTCSessionJoinState";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";
import { useRoomAvatar } from "./useRoomAvatar";
import { useRoomName } from "./useRoomName";
import { useJoinRule } from "./useJoinRule";
import { InviteModal } from "./InviteModal";
import { useUrlParams } from "../UrlParams";
import { E2eeType } from "../e2ee/e2eeType";

declare global {
  interface Window {
    rtcSession?: MatrixRTCSession;
  }
}

interface Props {
  client: MatrixClient;
  isPasswordlessUser: boolean;
  confineToRoom: boolean;
  preload: boolean;
  skipLobby: boolean;
  hideHeader: boolean;
  rtcSession: MatrixRTCSession;
  muteStates: MuteStates;
}

export const GroupCallView: FC<Props> = ({
  client,
  isPasswordlessUser,
  confineToRoom,
  preload,
  skipLobby,
  hideHeader,
  rtcSession,
  muteStates,
}) => {
  const memberships = useMatrixRTCSessionMemberships(rtcSession);
  const isJoined = useMatrixRTCSessionJoinState(rtcSession);

  // This should use `useEffectEvent` (only available in experimental versions)
  useEffect(() => {
    if (memberships.length >= MUTE_PARTICIPANT_COUNT)
      muteStates.audio.setEnabled?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.rtcSession = rtcSession;
    return (): void => {
      delete window.rtcSession;
    };
  }, [rtcSession]);

  const { displayName, avatarUrl } = useProfile(client);
  const roomName = useRoomName(rtcSession.room);
  const roomAvatar = useRoomAvatar(rtcSession.room);
  const { perParticipantE2EE, returnToLobby } = useUrlParams();
  const e2eeSystem = useRoomEncryptionSystem(rtcSession.room.roomId);

  const matrixInfo = useMemo((): MatrixInfo => {
    return {
      userId: client.getUserId()!,
      displayName: displayName!,
      avatarUrl: avatarUrl!,
      roomId: rtcSession.room.roomId,
      roomName,
      roomAlias: rtcSession.room.getCanonicalAlias(),
      roomAvatar,
      e2eeSystem,
    };
  }, [
    client,
    displayName,
    avatarUrl,
    rtcSession.room,
    roomName,
    roomAvatar,
    e2eeSystem,
  ]);

  // Count each member only once, regardless of how many devices they use
  const participantCount = useMemo(
    () => new Set<string>(memberships.map((m) => m.sender!)).size,
    [memberships],
  );

  const deviceContext = useMediaDevices();
  const latestDevices = useRef<MediaDevices>();
  latestDevices.current = deviceContext;

  const latestMuteStates = useRef<MuteStates>();
  latestMuteStates.current = muteStates;

  useEffect(() => {
    const defaultDeviceSetup = async (
      requestedDeviceData: JoinCallData,
    ): Promise<void> => {
      // XXX: I think this is broken currently - LiveKit *won't* request
      // permissions and give you device names unless you specify a kind, but
      // here we want all kinds of devices. This needs a fix in livekit-client
      // for the following name-matching logic to do anything useful.
      const devices = await Room.getLocalDevices(undefined, true);
      const { audioInput, videoInput } = requestedDeviceData;
      if (audioInput === null) {
        latestMuteStates.current!.audio.setEnabled?.(false);
      } else {
        const deviceId = await findDeviceByName(
          audioInput,
          "audioinput",
          devices,
        );
        if (!deviceId) {
          logger.warn("Unknown audio input: " + audioInput);
          latestMuteStates.current!.audio.setEnabled?.(false);
        } else {
          logger.debug(
            `Found audio input ID ${deviceId} for name ${audioInput}`,
          );
          latestDevices.current!.audioInput.select(deviceId);
          latestMuteStates.current!.audio.setEnabled?.(true);
        }
      }

      if (videoInput === null) {
        latestMuteStates.current!.video.setEnabled?.(false);
      } else {
        const deviceId = await findDeviceByName(
          videoInput,
          "videoinput",
          devices,
        );
        if (!deviceId) {
          logger.warn("Unknown video input: " + videoInput);
          latestMuteStates.current!.video.setEnabled?.(false);
        } else {
          logger.debug(
            `Found video input ID ${deviceId} for name ${videoInput}`,
          );
          latestDevices.current!.videoInput.select(deviceId);
          latestMuteStates.current!.video.setEnabled?.(true);
        }
      }
    };

    if (widget && preload && skipLobby) {
      // In preload mode without lobby we wait for a join action before entering
      const onJoin = async (
        ev: CustomEvent<IWidgetApiRequest>,
      ): Promise<void> => {
        await defaultDeviceSetup(ev.detail.data as unknown as JoinCallData);
        await enterRTCSession(rtcSession, perParticipantE2EE);
        await widget!.api.transport.reply(ev.detail, {});
      };
      widget.lazyActions.on(ElementWidgetActions.JoinCall, onJoin);
      return (): void => {
        widget!.lazyActions.off(ElementWidgetActions.JoinCall, onJoin);
      };
    } else if (widget && !preload && skipLobby) {
      const join = async (): Promise<void> => {
        await defaultDeviceSetup({ audioInput: null, videoInput: null });
        await enterRTCSession(rtcSession, perParticipantE2EE);
      };
      // No lobby and no preload: we enter the RTC Session right away.
      join();
    }
  }, [rtcSession, preload, skipLobby, perParticipantE2EE]);

  const [left, setLeft] = useState(false);
  const [leaveError, setLeaveError] = useState<Error | undefined>(undefined);
  const history = useHistory();

  const onLeave = useCallback(
    async (leaveError?: Error) => {
      setLeaveError(leaveError);
      setLeft(true);

      // In embedded/widget mode the iFrame will be killed right after the call ended prohibiting the posthog event from getting sent,
      // therefore we want the event to be sent instantly without getting queued/batched.
      const sendInstantly = !!widget;
      PosthogAnalytics.instance.eventCallEnded.track(
        rtcSession.room.roomId,
        rtcSession.memberships.length,
        sendInstantly,
      );

      // Only sends matrix leave event. The Livekit session will disconnect once the ActiveCall-view unmounts.
      await leaveRTCSession(rtcSession);

      if (
        !isPasswordlessUser &&
        !confineToRoom &&
        !PosthogAnalytics.instance.isEnabled()
      ) {
        history.push("/");
      }
    },
    [rtcSession, isPasswordlessUser, confineToRoom, history],
  );

  useEffect(() => {
    if (widget && isJoined) {
      // set widget to sticky once joined.
      widget!.api.setAlwaysOnScreen(true);

      const onHangup = async (
        ev: CustomEvent<IWidgetApiRequest>,
      ): Promise<void> => {
        widget!.api.transport.reply(ev.detail, {});
        // Only sends matrix leave event. The Livekit session will disconnect once the ActiveCall-view unmounts.
        await leaveRTCSession(rtcSession);
      };
      widget.lazyActions.once(ElementWidgetActions.HangupCall, onHangup);
      return (): void => {
        widget!.lazyActions.off(ElementWidgetActions.HangupCall, onHangup);
      };
    }
  }, [isJoined, rtcSession]);

  const onReconnect = useCallback(() => {
    setLeft(false);
    setLeaveError(undefined);
    enterRTCSession(rtcSession, perParticipantE2EE);
  }, [rtcSession, perParticipantE2EE]);

  const joinRule = useJoinRule(rtcSession.room);

  const [shareModalOpen, setInviteModalOpen] = useState(false);
  const onDismissInviteModal = useCallback(
    () => setInviteModalOpen(false),
    [setInviteModalOpen],
  );

  const onShareClickFn = useCallback(
    () => setInviteModalOpen(true),
    [setInviteModalOpen],
  );
  const onShareClick = joinRule === JoinRule.Public ? onShareClickFn : null;

  const onHomeClick = useCallback(
    (ev: React.MouseEvent) => {
      ev.preventDefault();
      history.push("/");
    },
    [history],
  );

  const { t } = useTranslation();

  if (!isE2EESupportedBrowser() && e2eeSystem.kind !== E2eeType.NONE) {
    // If we have a encryption system but the browser does not support it.
    return (
      <FullScreenView>
        <Heading>{t("browser_media_e2ee_unsupported_heading")}</Heading>
        <Text>{t("browser_media_e2ee_unsupported")}</Text>
        <Link href="/" onClick={onHomeClick}>
          {t("common.home")}
        </Link>
      </FullScreenView>
    );
  }

  const shareModal = (
    <InviteModal
      room={rtcSession.room}
      open={shareModalOpen}
      onDismiss={onDismissInviteModal}
    />
  );
  const lobbyView = (
    <>
      {shareModal}
      <LobbyView
        client={client}
        matrixInfo={matrixInfo}
        muteStates={muteStates}
        onEnter={() => void enterRTCSession(rtcSession, perParticipantE2EE)}
        confineToRoom={confineToRoom}
        hideHeader={hideHeader}
        participantCount={participantCount}
        onShareClick={onShareClick}
      />
    </>
  );

  if (isJoined) {
    return (
      <>
        {shareModal}
        <ActiveCall
          client={client}
          matrixInfo={matrixInfo}
          rtcSession={rtcSession}
          participantCount={participantCount}
          onLeave={onLeave}
          hideHeader={hideHeader}
          muteStates={muteStates}
          e2eeSystem={e2eeSystem}
          //otelGroupCallMembership={otelGroupCallMembership}
          onShareClick={onShareClick}
        />
      </>
    );
  } else if (left && widget === null) {
    // Left in SPA mode:

    // The call ended view is shown for two reasons: prompting guests to create
    // an account, and prompting users that have opted into analytics to provide
    // feedback. We don't show a feedback prompt to widget users however (at
    // least for now), because we don't yet have designs that would allow widget
    // users to dismiss the feedback prompt and close the call window without
    // submitting anything.
    if (
      isPasswordlessUser ||
      (PosthogAnalytics.instance.isEnabled() && widget === null) ||
      leaveError
    ) {
      return (
        <CallEndedView
          endedCallId={rtcSession.room.roomId}
          client={client}
          isPasswordlessUser={isPasswordlessUser}
          confineToRoom={confineToRoom}
          leaveError={leaveError}
          reconnect={onReconnect}
        />
      );
    } else {
      // If the user is a regular user, we'll have sent them back to the homepage,
      // so just sit here & do nothing: otherwise we would (briefly) mount the
      // LobbyView again which would open capture devices again.
      return null;
    }
  } else if (left && widget !== null) {
    // Left in widget mode:
    if (!returnToLobby) {
      return null;
    }
  } else if (preload || skipLobby) {
    return null;
  }

  return lobbyView;
};
