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
import { useLocation, useParams, useHistory, Link } from "react-router-dom";
import {
  Button,
  CopyButton,
  HangupButton,
  MicButton,
  VideoButton,
  ScreenshareButton,
} from "./button";
import {
  Header,
  LeftNav,
  RightNav,
  RoomHeaderInfo,
  RoomSetupHeaderInfo,
  HeaderLogo,
} from "./Header";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import VideoGrid, {
  useVideoGridLayout,
} from "matrix-react-sdk/src/components/views/voip/GroupCallView/VideoGrid";
import SimpleVideoGrid from "matrix-react-sdk/src/components/views/voip/GroupCallView/SimpleVideoGrid";
import "matrix-react-sdk/res/css/views/voip/GroupCallView/_VideoGrid.scss";
import { useGroupCall } from "matrix-react-sdk/src/hooks/useGroupCall";
import { useCallFeed } from "matrix-react-sdk/src/hooks/useCallFeed";
import { useMediaStream } from "matrix-react-sdk/src/hooks/useMediaStream";
import { useClient, useLoadGroupCall } from "./ConferenceCallManagerHooks";
import { ErrorModal } from "./ErrorModal";
import { GroupCallInspector } from "./GroupCallInspector";
import * as Sentry from "@sentry/react";
import { OverflowMenu } from "./OverflowMenu";
import { GridLayoutMenu } from "./GridLayoutMenu";
import { UserMenu } from "./UserMenu";

const canScreenshare = "getDisplayMedia" in navigator.mediaDevices;
// There is currently a bug in Safari our our code with cloning and sending MediaStreams
// or with getUsermedia and getDisplaymedia being used within the same session.
// For now we can disable screensharing in Safari.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export function Room() {
  const [registeringGuest, setRegisteringGuest] = useState(false);
  const [registrationError, setRegistrationError] = useState();
  const { loading, isAuthenticated, error, client, registerGuest } =
    useClient();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setRegisteringGuest(true);

      registerGuest()
        .then(() => {
          setRegisteringGuest(false);
        })
        .catch((error) => {
          setRegistrationError(error);
          setRegisteringGuest(false);
        });
    }
  }, [loading, isAuthenticated]);

  if (loading || registeringGuest) {
    return <div>Loading...</div>;
  }

  if (registrationError || error) {
    return <ErrorModal error={registrationError || error} />;
  }

  return <GroupCall client={client} />;
}

export function GroupCall({ client }) {
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
      <div className={styles.room}>
        <LoadingRoomView />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.room}>
        <Header>
          <LeftNav>
            <HeaderLogo />
          </LeftNav>
        </Header>
        <ErrorModal error={error} />
      </div>
    );
  }

  return (
    <div className={styles.room}>
      <GroupCallView
        client={client}
        groupCall={groupCall}
        simpleGrid={simpleGrid}
      />
    </div>
  );
}

export function GroupCallView({ client, groupCall, simpleGrid }) {
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

  if (error) {
    return (
      <>
        <Header>
          <LeftNav>
            <HeaderLogo />
          </LeftNav>
        </Header>
        <ErrorModal error={error} />
      </>
    );
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
        simpleGrid={simpleGrid}
        setShowInspector={setShowInspector}
        showInspector={showInspector}
      />
    );
  } else if (state === GroupCallState.Entering) {
    return <EnteringRoomView />;
  } else {
    return (
      <RoomSetupView
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
  client,
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
  setShowInspector,
  showInspector,
}) {
  const history = useHistory();
  const { stream } = useCallFeed(localCallFeed);
  const videoRef = useMediaStream(stream, true);

  useEffect(() => {
    onInitLocalCallFeed();
  }, [onInitLocalCallFeed]);

  return (
    <>
      <Header>
        <LeftNav>
          <RoomSetupHeaderInfo
            onPress={() => history.goBack()}
            roomName={roomName}
          />
        </LeftNav>
        <RightNav>
          <UserMenu />
        </RightNav>
      </Header>
      <div className={styles.joinRoom}>
        <h1>New Call</h1>
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
          {state === GroupCallState.LocalCallFeedInitialized && (
            <>
              <Button
                className={styles.joinCallButton}
                disabled={state !== GroupCallState.LocalCallFeedInitialized}
                onPress={onEnter}
              >
                Join call now
              </Button>
              <div className={styles.previewButtons}>
                <MicButton
                  muted={microphoneMuted}
                  onPress={toggleMicrophoneMuted}
                />
                <VideoButton
                  muted={localVideoMuted}
                  onPress={toggleLocalVideoMuted}
                />
                <OverflowMenu
                  roomUrl={window.location.href}
                  setShowInspector={setShowInspector}
                  showInspector={showInspector}
                  client={client}
                />
              </div>
            </>
          )}
        </div>
        <p>Or</p>
        <CopyButton value={window.location.href} className={styles.copyButton}>
          Copy call link and join later
        </CopyButton>
        <Link className={styles.homeLink} to="/">
          Take me Home
        </Link>
      </div>
    </>
  );
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
  simpleGrid,
  setShowInspector,
  showInspector,
}) {
  const [layout, setLayout] = useVideoGridLayout();

  const items = useMemo(() => {
    const participants = [];

    for (const callFeed of userMediaFeeds) {
      participants.push({
        id: callFeed.stream.id,
        usermediaCallFeed: callFeed,
        isActiveSpeaker:
          screenshareFeeds.length === 0
            ? callFeed.userId === activeSpeaker
            : false,
      });
    }

    for (const callFeed of screenshareFeeds) {
      const participant = participants.find(
        (p) => p.usermediaCallFeed.userId === callFeed.userId
      );
      participant.screenshareCallFeed = callFeed;
    }

    return participants;
  }, [userMediaFeeds, activeSpeaker, screenshareFeeds]);

  const onFocusTile = useCallback(
    (tiles, focusedTile) => {
      if (layout === "freedom") {
        return tiles.map((tile) => {
          if (tile === focusedTile) {
            return { ...tile, presenter: !tile.presenter };
          }

          return tile;
        });
      } else {
        setLayout("spotlight");

        return tiles.map((tile) => {
          if (tile === focusedTile) {
            return { ...tile, presenter: true };
          }

          return { ...tile, presenter: false };
        });
      }
    },
    [layout, setLayout]
  );

  return (
    <>
      <Header>
        <LeftNav>
          <RoomHeaderInfo roomName={roomName} />
        </LeftNav>
        <RightNav>
          <GridLayoutMenu layout={layout} setLayout={setLayout} />
          <UserMenu />
        </RightNav>
      </Header>
      {items.length === 0 ? (
        <div className={styles.centerMessage}>
          <p>Waiting for other participants...</p>
        </div>
      ) : simpleGrid ? (
        <SimpleVideoGrid items={items} />
      ) : (
        <VideoGrid
          items={items}
          layout={layout}
          onFocusTile={onFocusTile}
          disableAnimations={isSafari}
        />
      )}
      <div className={styles.footer}>
        <MicButton muted={microphoneMuted} onPress={toggleMicrophoneMuted} />
        <VideoButton muted={localVideoMuted} onPress={toggleLocalVideoMuted} />
        {canScreenshare && !isSafari && (
          <ScreenshareButton
            enabled={isScreensharing}
            onPress={toggleScreensharing}
          />
        )}
        <OverflowMenu
          roomUrl={window.location.href}
          setShowInspector={setShowInspector}
          showInspector={showInspector}
          client={client}
        />
        <HangupButton onPress={onLeave} />
      </div>
      <GroupCallInspector
        client={client}
        groupCall={groupCall}
        show={showInspector}
      />
    </>
  );
}
