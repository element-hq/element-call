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
  LinkButton,
} from "./button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "./Header";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import VideoGrid, {
  useVideoGridLayout,
} from "matrix-react-sdk/src/components/views/voip/GroupCallView/VideoGrid";
import SimpleVideoGrid from "matrix-react-sdk/src/components/views/voip/GroupCallView/SimpleVideoGrid";
import "matrix-react-sdk/res/css/views/voip/GroupCallView/_VideoGrid.scss";
import { useGroupCall } from "matrix-react-sdk/src/hooks/useGroupCall";
import { useCallFeed } from "matrix-react-sdk/src/hooks/useCallFeed";
import { useMediaStream } from "matrix-react-sdk/src/hooks/useMediaStream";
import {
  useClient,
  useLoadGroupCall,
  useProfile,
} from "./ConferenceCallManagerHooks";
import { ErrorView, LoadingView, FullScreenView } from "./FullScreenView";
import { GroupCallInspector } from "./GroupCallInspector";
import * as Sentry from "@sentry/react";
import { OverflowMenu } from "./OverflowMenu";
import { GridLayoutMenu } from "./GridLayoutMenu";
import { UserMenu } from "./UserMenu";
import classNames from "classnames";

const canScreenshare = "getDisplayMedia" in navigator.mediaDevices;
// There is currently a bug in Safari our our code with cloning and sending MediaStreams
// or with getUsermedia and getDisplaymedia being used within the same session.
// For now we can disable screensharing in Safari.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export function Room() {
  const [registeringGuest, setRegisteringGuest] = useState(false);
  const [registrationError, setRegistrationError] = useState();
  const {
    loading,
    isAuthenticated,
    error,
    client,
    registerGuest,
    isGuest,
    isPasswordlessUser,
  } = useClient();

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
    return <LoadingView />;
  }

  if (registrationError || error) {
    return <ErrorView error={registrationError || error} />;
  }

  return (
    <GroupCall
      client={client}
      isGuest={isGuest}
      isPasswordlessUser={isPasswordlessUser}
    />
  );
}

export function GroupCall({ client, isGuest, isPasswordlessUser }) {
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
    return <LoadingRoomView />;
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  return (
    <GroupCallView
      isGuest={isGuest}
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
  isGuest,
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

    if (!isGuest && !isPasswordlessUser) {
      history.push("/");
    } else {
      setLeft(true);
    }
  }, [leave, history, isGuest]);

  if (error) {
    return <ErrorView error={error} />;
  } else if (state === GroupCallState.Entered) {
    return (
      <InRoomView
        groupCall={groupCall}
        client={client}
        isGuest={isGuest}
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
    return <EnteringRoomView />;
  } else if (left) {
    if (isPasswordlessUser) {
      return <PasswordlessUserCallEndedScreen client={client} />;
    } else {
      return <GuestCallEndedScreen />;
    }
  } else {
    return (
      <RoomSetupView
        isGuest={isGuest}
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

export function LoadingRoomView() {
  return (
    <FullScreenView>
      <h1>Loading room...</h1>
    </FullScreenView>
  );
}

export function EnteringRoomView() {
  return (
    <FullScreenView>
      <h1>Entering room...</h1>
    </FullScreenView>
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
  setShowInspector,
  showInspector,
  roomId,
}) {
  const { stream } = useCallFeed(localCallFeed);
  const videoRef = useMediaStream(stream, true);
  const location = useLocation();

  useEffect(() => {
    onInitLocalCallFeed();
  }, [onInitLocalCallFeed]);

  return (
    <div className={styles.room}>
      <Header>
        <LeftNav>
          <RoomHeaderInfo roomName={roomName} />
        </LeftNav>
        <RightNav>
          <UserMenu />
        </RightNav>
      </Header>
      <div className={styles.joinRoom}>
        <div className={styles.joinRoomContent}>
          <div className={styles.preview}>
            <video ref={videoRef} muted playsInline disablePictureInPicture />
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
                    roomId={roomId}
                    setShowInspector={setShowInspector}
                    showInspector={showInspector}
                    client={client}
                  />
                </div>
              </>
            )}
          </div>
          <p>Or</p>
          <CopyButton
            value={window.location.href}
            className={styles.copyButton}
            copiedMessage="Call link copied"
          >
            Copy call link and join later
          </CopyButton>
        </div>
        <div className={styles.joinRoomFooter}>
          <Link className={styles.homeLink} to="/">
            Take me Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function InRoomView({
  client,
  isGuest,
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
  roomId,
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

      if (participant) {
        participant.screenshareCallFeed = callFeed;
      }
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
    <div className={classNames(styles.room, styles.inRoom)}>
      <Header>
        <LeftNav>
          <RoomHeaderInfo roomName={roomName} />
        </LeftNav>
        <RightNav>
          <GridLayoutMenu layout={layout} setLayout={setLayout} />
          {!isGuest && <UserMenu disableLogout />}
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
          roomId={roomId}
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
    </div>
  );
}

export function GuestCallEndedScreen() {
  return (
    <FullScreenView className={styles.callEndedScreen}>
      <h1>Your call is now ended</h1>
      <div className={styles.callEndedContent}>
        <p>Why not finish by creating an account?</p>
        <p>You'll be able to:</p>
        <ul>
          <li>Easily access all your previous call links</li>
          <li>Set a username and avatar</li>
        </ul>
        <LinkButton
          className={styles.callEndedButton}
          size="lg"
          variant="default"
          to="/register"
        >
          Create account
        </LinkButton>
      </div>
      <Link to="/">Not now, return to home screen</Link>
    </FullScreenView>
  );
}

export function PasswordlessUserCallEndedScreen({ client }) {
  const { displayName } = useProfile(client);

  return (
    <FullScreenView className={styles.callEndedScreen}>
      <h1>{displayName}, your call is now ended</h1>
      <div className={styles.callEndedContent}>
        <p>Why not finish by setting up a password to keep your account?</p>
        <p>
          You'll be able to keep your name and set an avatar for use on future
          calls
        </p>
        <LinkButton
          className={styles.callEndedButton}
          size="lg"
          variant="default"
          to="/register"
        >
          Create account
        </LinkButton>
      </div>
      <Link to="/">Not now, return to home screen</Link>
    </FullScreenView>
  );
}
