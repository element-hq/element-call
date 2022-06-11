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
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { useGroupCall } from "./useGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";
import { LobbyView } from "./LobbyView";
import { InCallView } from "./InCallView";
import { PTTCallView } from "./PTTCallView";
import { CallEndedView } from "./CallEndedView";
import { useRoomAvatar } from "./useRoomAvatar";
import { useSentryGroupCallHandler } from "./useSentryGroupCallHandler";
import { useLocationNavigation } from "../useLocationNavigation";

export function GroupCallView({
  client,
  isPasswordlessUser,
  roomId,
  groupCall,
}) {
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
    localScreenshareFeed,
    screenshareFeeds,
    hasLocalParticipant,
    participants,
    unencryptedEventsFromUsers,
  } = useGroupCall(groupCall);

  const avatarUrl = useRoomAvatar(groupCall.room);

  useEffect(() => {
    window.groupCall = groupCall;
  }, [groupCall]);

  useSentryGroupCallHandler(groupCall);

  useLocationNavigation(requestingScreenshare);

  const [left, setLeft] = useState(false);
  const history = useHistory();

  const onLeave = useCallback(() => {
    setLeft(true);
    leave();

    if (!isPasswordlessUser) {
      history.push("/");
    }
  }, [leave, history]);

  if (error) {
    return <ErrorView error={error} />;
  } else if (state === GroupCallState.Entered) {
    if (groupCall.isPtt) {
      return (
        <PTTCallView
          client={client}
          roomId={roomId}
          roomName={groupCall.room.name}
          avatarUrl={avatarUrl}
          groupCall={groupCall}
          participants={participants}
          userMediaFeeds={userMediaFeeds}
          onLeave={onLeave}
        />
      );
    } else {
      return (
        <InCallView
          groupCall={groupCall}
          client={client}
          roomName={groupCall.room.name}
          avatarUrl={avatarUrl}
          microphoneMuted={microphoneMuted}
          localVideoMuted={localVideoMuted}
          toggleLocalVideoMuted={toggleLocalVideoMuted}
          toggleMicrophoneMuted={toggleMicrophoneMuted}
          userMediaFeeds={userMediaFeeds}
          activeSpeaker={activeSpeaker}
          onLeave={onLeave}
          toggleScreensharing={toggleScreensharing}
          isScreensharing={isScreensharing}
          localScreenshareFeed={localScreenshareFeed}
          screenshareFeeds={screenshareFeeds}
          roomId={roomId}
          unencryptedEventsFromUsers={unencryptedEventsFromUsers}
        />
      );
    }
  } else if (state === GroupCallState.Entering) {
    return (
      <FullScreenView>
        <h1>Entering room...</h1>
      </FullScreenView>
    );
  } else if (left) {
    return <CallEndedView client={client} />;
  } else {
    return (
      <LobbyView
        client={client}
        groupCall={groupCall}
        hasLocalParticipant={hasLocalParticipant}
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
        roomId={roomId}
      />
    );
  }
}
