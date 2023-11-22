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
import { Room, isE2EESupported } from "livekit-client";
import { logger } from "matrix-js-sdk/src/logger";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { JoinRule } from "matrix-js-sdk/src/matrix";
import { Heading, Link, Text } from "@vector-im/compound-web";
import { useTranslation } from "react-i18next";

import type { IWidgetApiRequest } from "matrix-widget-api";
import { widget, ElementWidgetActions, JoinCallData } from "../widget";
import { ErrorView, FullScreenView } from "../FullScreenView";
import { LobbyView } from "./LobbyView";
import { MatrixInfo } from "./VideoPreview";
import { CallEndedView } from "./CallEndedView";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { useProfile } from "../profile/useProfile";
import { findDeviceByName } from "../media-utils";
import { ActiveCall } from "./InCallView";
import { MuteStates, useMuteStates } from "./MuteStates";
import { useMediaDevices, MediaDevices } from "../livekit/MediaDevicesContext";
import { useMatrixRTCSessionMemberships } from "../useMatrixRTCSessionMemberships";
import { enterRTCSession, leaveRTCSession } from "../rtcSessionHelpers";
import { useMatrixRTCSessionJoinState } from "../useMatrixRTCSessionJoinState";
import { useIsRoomE2EE, useRoomSharedKey } from "../e2ee/sharedKeyManagement";
import { useRoomAvatar } from "./useRoomAvatar";
import { useRoomName } from "./useRoomName";
import { useJoinRule } from "./useJoinRule";
import { InviteModal } from "./InviteModal";
import { E2EEConfig } from "../livekit/useLiveKit";
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
}

export const GroupCallView: FC<Props> = ({
  client,
  isPasswordlessUser,
  confineToRoom,
  preload,
  skipLobby,
  hideHeader,
  rtcSession,
}) => {
  const memberships = useMatrixRTCSessionMemberships(rtcSession);
  const isJoined = useMatrixRTCSessionJoinState(rtcSession);

  useEffect(() => {
    window.rtcSession = rtcSession;
    return () => {
      delete window.rtcSession;
    };
  }, [rtcSession]);

  const { displayName, avatarUrl } = useProfile(client);
  const roomName = useRoomName(rtcSession.room);
  const roomAvatar = useRoomAvatar(rtcSession.room);
  const e2eeSharedKey = useRoomSharedKey(rtcSession.room.roomId);
  const { perParticipantE2EE } = useUrlParams();
  const roomEncrypted =
    useIsRoomE2EE(rtcSession.room.roomId) || perParticipantE2EE;

  const matrixInfo = useMemo((): MatrixInfo => {
    return {
      userId: client.getUserId()!,
      displayName: displayName!,
      avatarUrl: avatarUrl!,
      roomId: rtcSession.room.roomId,
      roomName,
      roomAlias: rtcSession.room.getCanonicalAlias(),
      roomAvatar,
      roomEncrypted,
    };
  }, [
    displayName,
    avatarUrl,
    rtcSession,
    roomName,
    roomAvatar,
    roomEncrypted,
    client,
  ]);

  // Count each member only once, regardless of how many devices they use
  const participantCount = useMemo(
    () => new Set<string>(memberships.map((m) => m.sender!)).size,
    [memberships],
  );

  const deviceContext = useMediaDevices();
  const latestDevices = useRef<MediaDevices>();
  latestDevices.current = deviceContext;

  const muteStates = useMuteStates(memberships.length);
  const latestMuteStates = useRef<MuteStates>();
  latestMuteStates.current = muteStates;

  useEffect(() => {
    // this effect is only if we don't want to show the lobby (skipLobby = true)
    if (!skipLobby) return;

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
    if (widget && preload) {
      // In preload mode, wait for a join action before entering
      const onJoin = async (
        ev: CustomEvent<IWidgetApiRequest>,
      ): Promise<void> => {
        defaultDeviceSetup(ev.detail.data as unknown as JoinCallData);
        enterRTCSession(rtcSession, perParticipantE2EE);
        await Promise.all([
          widget!.api.setAlwaysOnScreen(true),
          widget!.api.transport.reply(ev.detail, {}),
        ]);
      };
      widget.lazyActions.on(ElementWidgetActions.JoinCall, onJoin);
      return () => {
        widget!.lazyActions.off(ElementWidgetActions.JoinCall, onJoin);
      };
    } else {
      // if we don't use preload and only skipLobby we enter the rtc session right away
      defaultDeviceSetup({ audioInput: null, videoInput: null });
      enterRTCSession(rtcSession, perParticipantE2EE);
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
      const onHangup = async (
        ev: CustomEvent<IWidgetApiRequest>,
      ): Promise<void> => {
        widget!.api.transport.reply(ev.detail, {});
        await leaveRTCSession(rtcSession);
      };
      widget.lazyActions.once(ElementWidgetActions.HangupCall, onHangup);
      return () => {
        widget!.lazyActions.off(ElementWidgetActions.HangupCall, onHangup);
      };
    }
  }, [isJoined, rtcSession]);

  const e2eeConfig = useMemo((): E2EEConfig => {
    if (perParticipantE2EE) {
      return { mode: E2eeType.PER_PARTICIPANT };
    } else if (e2eeSharedKey) {
      return { mode: E2eeType.SHARED_KEY, sharedKey: e2eeSharedKey };
    } else {
      return { mode: E2eeType.NONE };
    }
  }, [perParticipantE2EE, e2eeSharedKey]);

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

  if (roomEncrypted && !perParticipantE2EE && !e2eeSharedKey) {
    return (
      <ErrorView
        error={
          new Error(
            "No E2EE key provided: please make sure the URL you're using to join this call has been retrieved using the in-app button.",
          )
        }
      />
    );
  } else if (!isE2EESupported() && roomEncrypted) {
    return (
      <FullScreenView>
        <Heading>Incompatible Browser</Heading>
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
          e2eeConfig={e2eeConfig}
          //otelGroupCallMembership={otelGroupCallMembership}
          onShareClick={onShareClick}
        />
      </>
    );
  } else if (left) {
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
  } else if (preload) {
    return null;
  } else {
    return (
      <>
        {shareModal}
        <LobbyView
          client={client}
          matrixInfo={matrixInfo}
          muteStates={muteStates}
          onEnter={(): void => enterRTCSession(rtcSession, perParticipantE2EE)}
          confineToRoom={confineToRoom}
          hideHeader={hideHeader}
          participantCount={participantCount}
          onShareClick={onShareClick}
        />
      </>
    );
  }
};
