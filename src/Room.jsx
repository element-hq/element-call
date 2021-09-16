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

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import styles from "./Room.module.css";
import { useParams, useLocation, useHistory, Link } from "react-router-dom";
import { useGroupCall } from "./ConferenceCallManagerHooks";
import { DevTools } from "./DevTools";
import { VideoGrid } from "./VideoGrid";
import {
  HangupButton,
  SettingsButton,
  MicButton,
  VideoButton,
  LayoutToggleButton,
} from "./RoomButton";
import { Header, LeftNav, RightNav, CenterNav } from "./Header";
import { Button, FieldRow, InputField, ErrorMessage } from "./Input";
import { Center, Content, Info, Modal } from "./Layout";

function useQuery() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

function useDebugMode() {
  const query = useQuery();
  const debugStr = query.get("debug");
  const debugEnabled = query.has("debug");
  const [debugMode, setDebugMode] = useState(
    debugStr === "" || debugStr === "true"
  );

  const toggleDebugMode = useCallback(() => {
    setDebugMode((prevDebugMode) => !prevDebugMode);
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (
        document.activeElement.tagName !== "input" &&
        event.code === "Backquote"
      ) {
        toggleDebugMode();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return { debugEnabled, debugMode, toggleDebugMode };
}

function useRoomLayout() {
  const [layout, setLayout] = useState("gallery");

  const toggleLayout = useCallback(() => {
    setLayout(layout === "spotlight" ? "gallery" : "spotlight");
  }, [layout]);

  return [layout, toggleLayout];
}

export function Room({ client }) {
  const { debugEnabled, debugMode, toggleDebugMode } = useDebugMode();
  const { roomId } = useParams();
  const {
    loading,
    entered,
    entering,
    roomName,
    participants,
    groupCall,
    microphoneMuted,
    localVideoMuted,
    error,
    initLocalParticipant,
    enter,
    leave,
    toggleLocalVideoMuted,
    toggleMicrophoneMuted,
    callDebugger,
  } = useGroupCall(client, roomId, debugEnabled);

  const content = () => {
    if (error) {
      return <LoadingErrorView error={error} />;
    }

    if (loading) {
      return <LoadingRoomView />;
    }

    if (entering) {
      return <EnteringRoomView />;
    }

    if (!entered) {
      return (
        <RoomSetupView
          roomName={roomName}
          onInitLocalParticipant={initLocalParticipant}
          onEnter={enter}
          microphoneMuted={microphoneMuted}
          localVideoMuted={localVideoMuted}
          toggleLocalVideoMuted={toggleLocalVideoMuted}
          toggleMicrophoneMuted={toggleMicrophoneMuted}
        />
      );
    } else {
      return (
        <InRoomView
          roomName={roomName}
          microphoneMuted={microphoneMuted}
          localVideoMuted={localVideoMuted}
          toggleLocalVideoMuted={toggleLocalVideoMuted}
          toggleMicrophoneMuted={toggleMicrophoneMuted}
          participants={participants}
          onLeave={leave}
          groupCall={groupCall}
          debugEnabled={debugEnabled}
          debugMode={debugMode}
          toggleDebugMode={toggleDebugMode}
          callDebugger={callDebugger}
        />
      );
    }
  };

  return <div className={styles.room}>{content()}</div>;
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

const PermissionState = {
  Waiting: "waiting",
  Granted: "granted",
  Denied: "denied",
};

function RoomSetupView({
  roomName,
  onInitLocalParticipant,
  onEnter,
  microphoneMuted,
  localVideoMuted,
  toggleLocalVideoMuted,
  toggleMicrophoneMuted,
}) {
  const videoRef = useRef();
  const [permissionState, setPermissionState] = useState(
    PermissionState.Waiting
  );

  useEffect(() => {
    onInitLocalParticipant()
      .then((localParticipant) => {
        if (videoRef.current) {
          videoRef.current.srcObject = localParticipant.usermediaStream;
          videoRef.current.play();
          setPermissionState(PermissionState.Granted);
        }
      })
      .catch((error) => {
        console.error(error);

        if (videoRef.current) {
          setPermissionState(PermissionState.Denied);
        }
      });
  }, [onInitLocalParticipant]);

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
          {permissionState === PermissionState.Denied && (
            <p className={styles.webcamPermissions}>
              Webcam permissions needed to join the call.
            </p>
          )}
          <video ref={videoRef} muted playsInline disablePictureInPicture />
        </div>
        {permissionState === PermissionState.Granted && (
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
          disabled={permissionState !== PermissionState.Granted}
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
  participants,
  onLeave,
  debugEnabled,
  debugMode,
  toggleDebugMode,
  callDebugger,
}) {
  const [roomLayout, toggleRoomLayout] = useRoomLayout();

  return (
    <>
      <Header>
        <LeftNav />
        <CenterNav>
          <h3>{roomName}</h3>
        </CenterNav>
        <RightNav>
          <LayoutToggleButton
            title={roomLayout === "spotlight" ? "Spotlight" : "Gallery"}
            layout={roomLayout}
            onClick={toggleRoomLayout}
          />
          {debugEnabled && (
            <SettingsButton
              title={debugMode ? "Disable DevTools" : "Enable DevTools"}
              onClick={toggleDebugMode}
            />
          )}
        </RightNav>
      </Header>
      {participants.length === 0 ? (
        <div className={styles.centerMessage}>
          <p>Waiting for other participants...</p>
        </div>
      ) : (
        <VideoGrid participants={participants} layout={roomLayout} />
      )}
      <div className={styles.footer}>
        <MicButton muted={microphoneMuted} onClick={toggleMicrophoneMuted} />
        <VideoButton
          enabled={localVideoMuted}
          onClick={toggleLocalVideoMuted}
        />
        <HangupButton onClick={onLeave} />
      </div>
      {debugEnabled && debugMode && callDebugger && (
        <DevTools callDebugger={callDebugger} />
      )}
    </>
  );
}
