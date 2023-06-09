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

import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { GroupCall, GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { useTranslation } from "react-i18next";

import type { IWidgetApiRequest } from "matrix-widget-api";
import { widget, ElementWidgetActions } from "../widget";
import { useGroupCall } from "./useGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";
import { LobbyView } from "./LobbyView";
import { MatrixInfo } from "./VideoPreview";
import { InCallView } from "./InCallView";
import { CallEndedView } from "./CallEndedView";
import { useSentryGroupCallHandler } from "./useSentryGroupCallHandler";
import { PosthogAnalytics } from "../PosthogAnalytics";
import { useProfile } from "../profile/useProfile";
import { useLiveKit } from "../livekit/useLiveKit";

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
    enter,
    leave,
    participants,
    unencryptedEventsFromUsers,
  } = useGroupCall(groupCall);

  const { t } = useTranslation();

  useEffect(() => {
    window.groupCall = groupCall;
    return () => {
      delete window.groupCall;
    };
  }, [groupCall]);

  const { displayName, avatarUrl } = useProfile(client);

  const matrixInfo: MatrixInfo = {
    userName: displayName,
    avatarUrl,
    roomName: groupCall.room.name,
    roomId: roomIdOrAlias,
  };

  const lkState = useLiveKit();

  useEffect(() => {
    if (widget && preload) {
      // In preload mode, wait for a join action before entering
      const onJoin = async (ev: CustomEvent<IWidgetApiRequest>) => {
        await groupCall.enter();

        PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
        PosthogAnalytics.instance.eventCallStarted.track(groupCall.groupCallId);

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
  }, [groupCall, preload]);

  useEffect(() => {
    if (isEmbedded && !preload) {
      // In embedded mode, bypass the lobby and just enter the call straight away
      groupCall.enter();

      PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
      PosthogAnalytics.instance.eventCallStarted.track(groupCall.groupCallId);
    }
  }, [groupCall, isEmbedded, preload]);

  useSentryGroupCallHandler(groupCall);

  const [left, setLeft] = useState(false);
  const history = useHistory();

  const onLeave = useCallback(async () => {
    setLeft(true);

    let participantCount = 0;
    for (const deviceMap of groupCall.participants.values()) {
      participantCount += deviceMap.size;
    }

    // In embedded/widget mode the iFrame will be killed right after the call ended prohibiting the posthog event from getting sent,
    // therefore we want the event to be sent instantly without getting queued/batched.
    const sendInstantly = !!widget;
    PosthogAnalytics.instance.eventCallEnded.track(
      groupCall.groupCallId,
      participantCount,
      sendInstantly
    );

    leave();
    if (widget) {
      // we need to wait until the callEnded event is tracked. Otherwise the iFrame gets killed before the callEnded event got tracked.
      await new Promise((resolve) => window.setTimeout(resolve, 10)); // 10ms
      widget.api.setAlwaysOnScreen(false);
      PosthogAnalytics.instance.logout();
      widget.api.transport.send(ElementWidgetActions.HangupCall, {});
    }

    if (!isPasswordlessUser && !isEmbedded) {
      history.push("/");
    }
  }, [groupCall, leave, isPasswordlessUser, isEmbedded, history]);

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
    return (
      <InCallView
        groupCall={groupCall}
        client={client}
        participants={participants}
        onLeave={onLeave}
        unencryptedEventsFromUsers={unencryptedEventsFromUsers}
        hideHeader={hideHeader}
        matrixInfo={matrixInfo}
        mediaDevices={lkState.mediaDevices}
        livekitRoom={lkState.room}
      />
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
  } else if (lkState) {
    return (
      <LobbyView
        matrixInfo={matrixInfo}
        mediaDevices={lkState.mediaDevices}
        localMedia={lkState.localMedia}
        onEnter={enter}
        isEmbedded={isEmbedded}
        hideHeader={hideHeader}
      />
    );
  } else {
    return null;
  }
}
