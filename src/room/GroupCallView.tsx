/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { GroupCall, GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { logger } from "matrix-js-sdk/src/logger";
import { useTranslation } from "react-i18next";

import type { IWidgetApiRequest } from "matrix-widget-api";
import { widget, ElementWidgetActions, JoinCallData } from "../widget";
import { useGroupCall } from "./useGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";
import { LobbyView } from "./LobbyView";
import { InCallView } from "./InCallView";
import { PTTCallView } from "./PTTCallView";
import { CallEndedView } from "./CallEndedView";
import { useRoomAvatar } from "./useRoomAvatar";
import { useSentryGroupCallHandler } from "./useSentryGroupCallHandler";
import { useLocationNavigation } from "../useLocationNavigation";
import { PosthogAnalytics } from "../PosthogAnalytics";
import { useMediaHandler } from "../settings/useMediaHandler";
import { findDeviceByName, getDevices } from "../media-utils";

declare global {
  interface Window {
    groupCall?: GroupCall;
  }
}

interface Props {
  client: MatrixClient;
  isPasswordlessUser: boolean;
  isEmbedded: boolean;
  preload: boolean;
  hideHeader: boolean;
  roomIdOrAlias: string;
  groupCall: GroupCall;
}

export function GroupCallView({
  client,
  isPasswordlessUser,
  isEmbedded,
  preload,
  hideHeader,
  roomIdOrAlias,
  groupCall,
}: Props) {
  const {
    state,
    error,
    activeSpeaker,
    userMediaFeeds,
    microphoneMuted,
    localVideoMuted,
    localCallFeed,
    initLocalCallFeed,
    enter,
    leave,
    toggleLocalVideoMuted,
    toggleMicrophoneMuted,
    toggleScreensharing,
    requestingScreenshare,
    isScreensharing,
    screenshareFeeds,
    participants,
    unencryptedEventsFromUsers,
  } = useGroupCall(groupCall);

  const { t } = useTranslation();
  const { setAudioInput, setVideoInput } = useMediaHandler();
  const avatarUrl = useRoomAvatar(groupCall.room);

  useEffect(() => {
    window.groupCall = groupCall;
    return () => {
      delete window.groupCall;
    };
  }, [groupCall]);

  useEffect(() => {
    if (widget && preload) {
      // In preload mode, wait for a join action before entering
      const onJoin = async (ev: CustomEvent<IWidgetApiRequest>) => {
        // Get the available devices so we can match the selected device
        // to its ID. This involves getting a media stream (see docs on
        // the function) so we only do it once and re-use the result.
        const devices = await getDevices();

        const { audioInput, videoInput } = ev.detail
          .data as unknown as JoinCallData;

        if (audioInput !== null) {
          const deviceId = await findDeviceByName(
            audioInput,
            "audioinput",
            devices
          );
          if (!deviceId) {
            logger.warn("Unknown audio input: " + audioInput);
          } else {
            logger.debug(
              `Found audio input ID ${deviceId} for name ${audioInput}`
            );
            setAudioInput(deviceId);
          }
        }

        if (videoInput !== null) {
          const deviceId = await findDeviceByName(
            videoInput,
            "videoinput",
            devices
          );
          if (!deviceId) {
            logger.warn("Unknown video input: " + videoInput);
          } else {
            logger.debug(
              `Found video input ID ${deviceId} for name ${videoInput}`
            );
            setVideoInput(deviceId);
          }
        }
        await Promise.all([
          groupCall.setMicrophoneMuted(audioInput === null),
          groupCall.setLocalVideoMuted(videoInput === null),
        ]);

        await groupCall.enter();
        await Promise.all([
          widget.api.setAlwaysOnScreen(true),
          widget.api.transport.reply(ev.detail, {}),
        ]);
      };

      widget.lazyActions.on(ElementWidgetActions.JoinCall, onJoin);
      return () => {
        widget.lazyActions.off(ElementWidgetActions.JoinCall, onJoin);
      };
    }
  }, [groupCall, preload, setAudioInput, setVideoInput]);

  useEffect(() => {
    if (isEmbedded && !preload) {
      // In embedded mode, bypass the lobby and just enter the call straight away
      groupCall.enter();
    }
  }, [groupCall, isEmbedded, preload]);

  useSentryGroupCallHandler(groupCall);

  useLocationNavigation(requestingScreenshare);

  const [left, setLeft] = useState(false);
  const history = useHistory();

  const onLeave = useCallback(() => {
    setLeft(true);

    PosthogAnalytics.instance.eventCallEnded.track(
      groupCall.room.name,
      groupCall.room.getMembers().length
    );

    leave();
    if (widget) {
      widget.api.transport.send(ElementWidgetActions.HangupCall, {});
      widget.api.setAlwaysOnScreen(false);
    }

    if (!isPasswordlessUser && !isEmbedded) {
      history.push("/");
    }
  }, [groupCall.room, leave, isPasswordlessUser, isEmbedded, history]);

  useEffect(() => {
    if (widget && state === GroupCallState.Entered) {
      const onHangup = async (ev: CustomEvent<IWidgetApiRequest>) => {
        leave();
        await widget.api.transport.reply(ev.detail, {});
        widget.api.setAlwaysOnScreen(false);
      };
      widget.lazyActions.once(ElementWidgetActions.HangupCall, onHangup);
      return () => {
        widget.lazyActions.off(ElementWidgetActions.HangupCall, onHangup);
      };
    }
  }, [groupCall, state, leave]);

  if (error) {
    return <ErrorView error={error} />;
  } else if (state === GroupCallState.Entered) {
    if (groupCall.isPtt) {
      return (
        <PTTCallView
          client={client}
          roomIdOrAlias={roomIdOrAlias}
          roomName={groupCall.room.name}
          avatarUrl={avatarUrl}
          groupCall={groupCall}
          participants={participants}
          userMediaFeeds={userMediaFeeds}
          onLeave={onLeave}
          isEmbedded={isEmbedded}
          hideHeader={hideHeader}
        />
      );
    } else {
      return (
        <InCallView
          groupCall={groupCall}
          client={client}
          roomName={groupCall.room.name}
          avatarUrl={avatarUrl}
          participants={participants}
          microphoneMuted={microphoneMuted}
          localVideoMuted={localVideoMuted}
          toggleLocalVideoMuted={toggleLocalVideoMuted}
          toggleMicrophoneMuted={toggleMicrophoneMuted}
          userMediaFeeds={userMediaFeeds}
          activeSpeaker={activeSpeaker}
          onLeave={onLeave}
          toggleScreensharing={toggleScreensharing}
          isScreensharing={isScreensharing}
          screenshareFeeds={screenshareFeeds}
          roomIdOrAlias={roomIdOrAlias}
          unencryptedEventsFromUsers={unencryptedEventsFromUsers}
          hideHeader={hideHeader}
        />
      );
    }
  } else if (state === GroupCallState.Entering) {
    return (
      <FullScreenView>
        <h1>{t("Entering room…")}</h1>
      </FullScreenView>
    );
  } else if (left) {
    if (isPasswordlessUser) {
      return <CallEndedView client={client} />;
    } else {
      // If the user is a regular user, we'll have sent them back to the homepage,
      // so just sit here & do nothing: otherwise we would (briefly) mount the
      // LobbyView again which would open capture devices again.
      return null;
    }
  } else if (preload) {
    return null;
  } else if (isEmbedded) {
    return (
      <FullScreenView>
        <h1>{t("Loading room…")}</h1>
      </FullScreenView>
    );
  } else {
    return (
      <LobbyView
        client={client}
        groupCall={groupCall}
        roomName={groupCall.room.name}
        avatarUrl={avatarUrl}
        state={state}
        onInitLocalCallFeed={initLocalCallFeed}
        localCallFeed={localCallFeed}
        onEnter={enter}
        microphoneMuted={microphoneMuted}
        localVideoMuted={localVideoMuted}
        toggleLocalVideoMuted={toggleLocalVideoMuted}
        toggleMicrophoneMuted={toggleMicrophoneMuted}
        roomIdOrAlias={roomIdOrAlias}
        isEmbedded={isEmbedded}
        hideHeader={hideHeader}
      />
    );
  }
}
