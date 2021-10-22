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
import styles from "./Room.module.css";
import { useLocation, useParams } from "react-router-dom";
import {
  HangupButton,
  MicButton,
  VideoButton,
  LayoutToggleButton,
  ScreenshareButton,
  DropdownButton,
  SettingsButton,
} from "./RoomButton";
import { Header, LeftNav, RightNav, CenterNav } from "./Header";
import { Button } from "./Input";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import VideoGrid, {
  useVideoGridLayout,
} from "matrix-react-sdk/src/components/views/voip/GroupCallView/VideoGrid";
import "matrix-react-sdk/res/css/views/voip/GroupCallView/_VideoGrid.scss";
import { useGroupCall } from "matrix-react-sdk/src/hooks/useGroupCall";
import { useCallFeed } from "matrix-react-sdk/src/hooks/useCallFeed";
import { useMediaStream } from "matrix-react-sdk/src/hooks/useMediaStream";
import { fetchGroupCall } from "./ConferenceCallManagerHooks";
import { ErrorModal } from "./ErrorModal";
import { GroupCallInspector } from "./GroupCallInspector";

const canScreenshare = "getDisplayMedia" in navigator.mediaDevices;

function useLoadGroupCall(client, roomId) {
  const [state, setState] = useState({
    loading: true,
    error: undefined,
    groupCall: undefined,
  });

  useEffect(() => {
    setState({ loading: true });
    fetchGroupCall(client, roomId, 30000)
      .then((groupCall) => setState({ loading: false, groupCall }))
      .catch((error) => setState({ loading: false, error }));
  }, [roomId]);

  return state;
}

export function Room({ client }) {
  const { roomId: maybeRoomId } = useParams();
  const { hash } = useLocation();
  const roomId = maybeRoomId || hash;
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
        <ErrorModal error={error} />
      </div>
    );
  }

  return (
    <div className={styles.room}>
      <GroupCallView client={client} groupCall={groupCall} />
    </div>
  );
}

export function GroupCallView({ client, groupCall }) {
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

  if (error) {
    return <ErrorModal error={error} />;
  } else if (state === GroupCallState.Entered) {
    return (
      <InRoomView
        groupCall={groupCall}
        client={client}
        roomName={groupCall.room.name}
        microphoneMuted={microphoneMuted}
        localVideoMuted={localVideoMuted}
        toggleLocalVideoMuted={toggleLocalVideoMuted}
        toggleMicrophoneMuted={toggleMicrophoneMuted}
        userMediaFeeds={userMediaFeeds}
        activeSpeaker={activeSpeaker}
        onLeave={leave}
        toggleScreensharing={toggleScreensharing}
        isScreensharing={isScreensharing}
        localScreenshareFeed={localScreenshareFeed}
        screenshareFeeds={screenshareFeeds}
      />
    );
  } else if (state === GroupCallState.Entering) {
    return <EnteringRoomView />;
  } else {
    return (
      <RoomSetupView
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
  hasLocalParticipant,
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
        {hasLocalParticipant && (
          <p>Warning, you are signed into this call on another device.</p>
        )}
        <div className={styles.preview}>
          {state === GroupCallState.LocalCallFeedUninitialized && (
            <p className={styles.webcamPermissions}>
              Webcam/microphone permissions needed to join the call.
            </p>
          )}
          {state === GroupCallState.InitializingLocalCallFeed && (
            <p className={styles.webcamPermissions}>
              Accept webcam/microphone permissions to join the call.
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

function useMediaHandler(client) {
  const [{ audioInput, videoInput, audioInputs, videoInputs }, setState] =
    useState({
      audioInput: null,
      videoInput: null,
      audioInputs: [],
      videoInputs: [],
    });

  useEffect(() => {
    function updateDevices() {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );
        const videoInputs = devices.filter(
          (device) => device.kind === "videoinput"
        );

        setState((prevState) => ({
          ...prevState,
          audioInputs,
          videoInputs,
        }));
      });
    }

    updateDevices();

    navigator.mediaDevices.addEventListener("devicechange", updateDevices);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
    };
  }, []);

  const setAudioInput = useCallback(
    (deviceId) => {
      setState((prevState) => ({ ...prevState, audioInput: deviceId }));
      client.getMediaHandler().setAudioInput(deviceId);
    },
    [client]
  );

  const setVideoInput = useCallback(
    (deviceId) => {
      setState((prevState) => ({ ...prevState, videoInput: deviceId }));
      client.getMediaHandler().setVideoInput(deviceId);
    },
    [client]
  );

  return {
    audioInput,
    audioInputs,
    setAudioInput,
    videoInput,
    videoInputs,
    setVideoInput,
  };
}

function InRoomView({
  client,
  groupCall,
  roomName,
  microphoneMuted,
  localVideoMuted,
  toggleLocalVideoMuted,
  toggleMicrophoneMuted,
  userMediaFeeds,
  activeSpeaker,
  onLeave,
  toggleScreensharing,
  isScreensharing,
  screenshareFeeds,
}) {
  const [showInspector, setShowInspector] = useState(false);

  const [layout, toggleLayout] = useVideoGridLayout();

  const {
    audioInput,
    audioInputs,
    setAudioInput,
    videoInput,
    videoInputs,
    setVideoInput,
  } = useMediaHandler(client);

  useEffect(() => {
    if (screenshareFeeds.length > 0 && layout === "gallery") {
      toggleLayout();
    }
  }, [screenshareFeeds]);

  const items = useMemo(() => {
    const participants = [];

    for (const callFeed of userMediaFeeds) {
      participants.push({
        id: callFeed.userId,
        callFeed,
        isActiveSpeaker:
          screenshareFeeds.length === 0
            ? callFeed.userId === activeSpeaker
            : false,
      });
    }

    for (const callFeed of screenshareFeeds) {
      participants.push({
        id: callFeed.userId + "-screenshare",
        callFeed,
        isActiveSpeaker: true,
      });
    }

    return participants;
  }, [userMediaFeeds, activeSpeaker, screenshareFeeds]);

  const onFocusTile = useCallback(
    (tiles, focusedTile) => {
      if (layout === "gallery") {
        return tiles.map((tile) => {
          if (tile === focusedTile) {
            return { ...tile, presenter: !tile.presenter };
          }

          return tile;
        });
      } else {
        toggleLayout();

        return tiles.map((tile) => {
          if (tile === focusedTile) {
            return { ...tile, presenter: true };
          }

          return { ...tile, presenter: false };
        });
      }
    },
    [layout, toggleLayout]
  );

  return (
    <>
      <Header>
        <LeftNav />
        <CenterNav>
          <h3>{roomName}</h3>
        </CenterNav>
        <RightNav>
          <SettingsButton
            title={showInspector ? "Hide Inspector" : "Show Inspector"}
            on={showInspector}
            onClick={() => setShowInspector((prev) => !prev)}
          />
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
        <VideoGrid items={items} layout={layout} onFocusTile={onFocusTile} />
      )}
      <div className={styles.footer}>
        <DropdownButton
          value={audioInput}
          onChange={({ value }) => setAudioInput(value)}
          options={audioInputs.map(({ label, deviceId }) => ({
            label,
            value: deviceId,
          }))}
        >
          <MicButton muted={microphoneMuted} onClick={toggleMicrophoneMuted} />
        </DropdownButton>
        <DropdownButton
          value={videoInput}
          onChange={({ value }) => setVideoInput(value)}
          options={videoInputs.map(({ label, deviceId }) => ({
            label,
            value: deviceId,
          }))}
        >
          <VideoButton
            enabled={localVideoMuted}
            onClick={toggleLocalVideoMuted}
          />
        </DropdownButton>
        {canScreenshare && (
          <ScreenshareButton
            enabled={isScreensharing}
            onClick={toggleScreensharing}
          />
        )}
        <HangupButton onClick={onLeave} />
      </div>
      <GroupCallInspector
        client={client}
        groupCall={groupCall}
        show={showInspector}
      />
    </>
  );
}
