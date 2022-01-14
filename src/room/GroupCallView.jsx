import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { useGroupCall } from "matrix-react-sdk/src/hooks/useGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";
import { LobbyView } from "./LobbyView";
import { InCallView } from "./InCallView";
import { CallEndedView } from "./CallEndedView";
import { useSentryGroupCallHandler } from "./useSentryGroupCallHandler";

export function GroupCallView({
  client,
  isPasswordlessUser,
  roomId,
  groupCall,
  simpleGrid,
}) {
  const [showInspector, setShowInspector] = useState(
    () => !!localStorage.getItem("matrix-group-call-inspector")
  );
  const onChangeShowInspector = useCallback((show) => {
    setShowInspector(show);

    if (show) {
      localStorage.setItem("matrix-group-call-inspector", "true");
    } else {
      localStorage.removeItem("matrix-group-call-inspector");
    }
  }, []);

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
    window.groupCall = groupCall;
  }, [groupCall]);

  useSentryGroupCallHandler(groupCall);

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
        setShowInspector={onChangeShowInspector}
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
        setShowInspector={onChangeShowInspector}
        showInspector={showInspector}
        roomId={roomId}
      />
    );
  }
}
