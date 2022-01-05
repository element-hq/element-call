/*
Copyright 2021 New Vector Ltd

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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useHistory } from "react-router-dom";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { useGroupCall } from "matrix-react-sdk/src/hooks/useGroupCall";
import { useClient, useLoadGroupCall } from "../ConferenceCallManagerHooks";
import { ErrorView, LoadingView, FullScreenView } from "../FullScreenView";
import * as Sentry from "@sentry/react";
import { LobbyView } from "./LobbyView";
import { InCallView } from "./InCallView";
import { CallEndedView } from "./CallEndedView";

export function RoomPage() {
  const [registrationError, setRegistrationError] = useState();
  const { loading, isAuthenticated, error, client, isPasswordlessUser } =
    useClient();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setRegistrationError(new Error("Must be registered"));
    }
  }, [loading, isAuthenticated]);

  if (loading) {
    return <LoadingView />;
  }

  if (registrationError || error) {
    return <ErrorView error={registrationError || error} />;
  }

  return <GroupCall client={client} isPasswordlessUser={isPasswordlessUser} />;
}

export function GroupCall({ client, isPasswordlessUser }) {
  const { roomId: maybeRoomId } = useParams();
  const { hash, search } = useLocation();
  const [simpleGrid, viaServers] = useMemo(() => {
    const params = new URLSearchParams(search);
    return [params.has("simple"), params.getAll("via")];
  }, [search]);
  const roomId = maybeRoomId || hash;
  const { loading, error, groupCall } = useLoadGroupCall(
    client,
    roomId,
    viaServers
  );

  useEffect(() => {
    window.groupCall = groupCall;
  }, [groupCall]);

  if (loading) {
    return (
      <FullScreenView>
        <h1>Loading room...</h1>
      </FullScreenView>
    );
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  return (
    <GroupCallView
      isPasswordlessUser={isPasswordlessUser}
      client={client}
      roomId={roomId}
      groupCall={groupCall}
      simpleGrid={simpleGrid}
    />
  );
}

export function GroupCallView({
  client,
  isPasswordlessUser,
  roomId,
  groupCall,
  simpleGrid,
}) {
  const [showInspector, setShowInspector] = useState(false);
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
    isScreensharing,
    localScreenshareFeed,
    screenshareFeeds,
    hasLocalParticipant,
  } = useGroupCall(groupCall);

  useEffect(() => {
    function onHangup(call) {
      if (call.hangupReason === "ice_failed") {
        Sentry.captureException(new Error("Call hangup due to ICE failure."));
      }
    }

    function onError(error) {
      Sentry.captureException(error);
    }

    if (groupCall) {
      groupCall.on("hangup", onHangup);
      groupCall.on("error", onError);
    }

    return () => {
      if (groupCall) {
        groupCall.removeListener("hangup", onHangup);
        groupCall.removeListener("error", onError);
      }
    };
  }, [groupCall]);

  const [left, setLeft] = useState(false);
  const history = useHistory();

  const onLeave = useCallback(() => {
    leave();

    if (!isPasswordlessUser) {
      history.push("/");
    } else {
      setLeft(true);
    }
  }, [leave, history]);

  if (error) {
    return <ErrorView error={error} />;
  } else if (state === GroupCallState.Entered) {
    return (
      <InCallView
        groupCall={groupCall}
        client={client}
        roomName={groupCall.room.name}
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
        simpleGrid={simpleGrid}
        setShowInspector={setShowInspector}
        showInspector={showInspector}
        roomId={roomId}
      />
    );
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
        hasLocalParticipant={hasLocalParticipant}
        roomName={groupCall.room.name}
        state={state}
        onInitLocalCallFeed={initLocalCallFeed}
        localCallFeed={localCallFeed}
        onEnter={enter}
        microphoneMuted={microphoneMuted}
        localVideoMuted={localVideoMuted}
        toggleLocalVideoMuted={toggleLocalVideoMuted}
        toggleMicrophoneMuted={toggleMicrophoneMuted}
        setShowInspector={setShowInspector}
        showInspector={showInspector}
        roomId={roomId}
      />
    );
  }
}
