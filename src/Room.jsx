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

import React, { useEffect, useMemo, useState } from "react";
import styles from "./Room.module.css";
import { useParams } from "react-router-dom";
import {
  HangupButton,
  MicButton,
  VideoButton,
  LayoutToggleButton,
} from "./RoomButton";
import { Header, LeftNav, RightNav, CenterNav } from "./Header";
import { Button, ErrorMessage } from "./Input";
import {
  GroupCallIntent,
  GroupCallState,
  GroupCallType,
} from "matrix-js-sdk/src/webrtc/groupCall";
import VideoGrid, {
  useVideoGridLayout,
} from "matrix-react-sdk/src/components/views/voip/GroupCallView/VideoGrid";
import "matrix-react-sdk/res/css/views/voip/GroupCallView/_VideoGrid.scss";
import { useGroupCall } from "matrix-react-sdk/src/hooks/useGroupCall";
import { useCallFeed } from "matrix-react-sdk/src/hooks/useCallFeed";
import { useMediaStream } from "matrix-react-sdk/src/hooks/useMediaStream";
import { fetchRoom } from "./ConferenceCallManagerHooks";

function useLoadGroupCall(client, roomId) {
  const [state, setState] = useState({
    loading: true,
    error: undefined,
    groupCall: undefined,
  });

  useEffect(() => {
    async function load() {
      await fetchRoom(client, roomId);

      let groupCall = client.getGroupCallForRoom(roomId);

      if (!groupCall) {
        groupCall = await client.createGroupCall(
          roomId,
          GroupCallType.Video,
          GroupCallIntent.Prompt
        );
      }

      return groupCall;
    }

    setState({ loading: true });

    load()
      .then((groupCall) => setState({ loading: false, groupCall }))
      .catch((error) => setState({ loading: false, error }));
  }, [roomId]);

  return state;
}

export function Room({ client }) {
  const { roomId } = useParams();
  const { loading, error, groupCall } = useLoadGroupCall(client, roomId);

  if (loading) {
    return (
      <div className={styles.room}>
        <LoadingRoomView />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.room}>
        <LoadingErrorView error={error} />
      </div>
    );
  }

  return (
    <div className={styles.room}>
      <GroupCallView groupCall={groupCall} />
    </div>
  );
}

export function GroupCallView({ groupCall }) {
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
  } = useGroupCall(groupCall);

  if (error) {
    return <LoadingErrorView error={error} />;
  } else if (state === GroupCallState.Entered) {
    return (
      <InRoomView
        roomName={groupCall.room.name}
        microphoneMuted={microphoneMuted}
        localVideoMuted={localVideoMuted}
        toggleLocalVideoMuted={toggleLocalVideoMuted}
        toggleMicrophoneMuted={toggleMicrophoneMuted}
        userMediaFeeds={userMediaFeeds}
        activeSpeaker={activeSpeaker}
        onLeave={leave}
      />
    );
  } else if (state === GroupCallState.Entering) {
    return <EnteringRoomView />;
  } else {
    return (
      <RoomSetupView
        roomName={groupCall.room.name}
        state={state}
        onInitLocalCallFeed={initLocalCallFeed}
        localCallFeed={localCallFeed}
        onEnter={enter}
        microphoneMuted={microphoneMuted}
        localVideoMuted={localVideoMuted}
        toggleLocalVideoMuted={toggleLocalVideoMuted}
        toggleMicrophoneMuted={toggleMicrophoneMuted}
      />
    );
  }
}

export function LoadingRoomView() {
  return (
    <>
      <div className={styles.centerMessage}>
        <p>Loading room...</p>
      </div>
    </>
  );
}

export function EnteringRoomView() {
  return (
    <>
      <div className={styles.centerMessage}>
        <p>Entering room...</p>
      </div>
    </>
  );
}

export function LoadingErrorView({ error }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <div className={styles.centerMessage}>
        <ErrorMessage>{error.message}</ErrorMessage>
      </div>
    </>
  );
}

function RoomSetupView({
  roomName,
  state,
  onInitLocalCallFeed,
  onEnter,
  localCallFeed,
  microphoneMuted,
  localVideoMuted,
  toggleLocalVideoMuted,
  toggleMicrophoneMuted,
}) {
  const { stream } = useCallFeed(localCallFeed);
  const videoRef = useMediaStream(stream, true);

  useEffect(() => {
    onInitLocalCallFeed();
  }, [onInitLocalCallFeed]);

  return (
    <>
      <Header>
        <LeftNav />
        <CenterNav>
          <h3>{roomName}</h3>
        </CenterNav>
      </Header>
      <div className={styles.joinRoom}>
        <div className={styles.preview}>
          {state !== GroupCallState.LocalCallFeedInitialized && (
            <p className={styles.webcamPermissions}>
              Webcam permissions needed to join the call.
            </p>
          )}
          <video ref={videoRef} muted playsInline disablePictureInPicture />
        </div>
        {state === GroupCallState.LocalCallFeedInitialized && (
          <div className={styles.previewButtons}>
            <MicButton
              muted={microphoneMuted}
              onClick={toggleMicrophoneMuted}
            />
            <VideoButton
              enabled={localVideoMuted}
              onClick={toggleLocalVideoMuted}
            />
          </div>
        )}
        <Button
          disabled={state !== GroupCallState.LocalCallFeedInitialized}
          onClick={onEnter}
        >
          Enter Call
        </Button>
      </div>
    </>
  );
}

function InRoomView({
  roomName,
  microphoneMuted,
  localVideoMuted,
  toggleLocalVideoMuted,
  toggleMicrophoneMuted,
  userMediaFeeds,
  activeSpeaker,
  onLeave,
}) {
  const [layout, toggleLayout] = useVideoGridLayout();

  const items = useMemo(
    () =>
      userMediaFeeds.map((callFeed) => ({
        id: callFeed.userId,
        callFeed,
        isActiveSpeaker: callFeed.userId === activeSpeaker,
      })),
    [userMediaFeeds, activeSpeaker]
  );

  return (
    <>
      <Header>
        <LeftNav />
        <CenterNav>
          <h3>{roomName}</h3>
        </CenterNav>
        <RightNav>
          <LayoutToggleButton
            title={layout === "spotlight" ? "Spotlight" : "Gallery"}
            layout={layout}
            onClick={toggleLayout}
          />
        </RightNav>
      </Header>
      {items.length === 0 ? (
        <div className={styles.centerMessage}>
          <p>Waiting for other participants...</p>
        </div>
      ) : (
        <VideoGrid items={items} layout={layout} />
      )}
      <div className={styles.footer}>
        <MicButton muted={microphoneMuted} onClick={toggleMicrophoneMuted} />
        <VideoButton
          enabled={localVideoMuted}
          onClick={toggleLocalVideoMuted}
        />
        <HangupButton onClick={onLeave} />
      </div>
    </>
  );
}
