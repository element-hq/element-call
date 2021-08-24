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

import React, { useEffect, useMemo, useState, useRef } from "react";
import styles from "./Room.module.css";
import { useParams, useLocation } from "react-router-dom";
import { useVideoRoom } from "./ConferenceCallManagerHooks";
import { DevTools } from "./DevTools";
import { VideoGrid } from "./VideoGrid";
import {
  HangupButton,
  SettingsButton,
  MicButton,
  VideoButton,
} from "./RoomButton";
import { Header, LeftNav, RightNav, CenterNav } from "./Header";
import { Button } from "./Input";

function useQuery() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

export function Room({ children, manager }) {
  const { roomId } = useParams();
  const query = useQuery();
  const {
    loading,
    joined,
    joining,
    room,
    participants,
    error,
    joinCall,
    leaveCall,
    toggleMuteVideo,
    toggleMuteMic,
    videoMuted,
    micMuted,
  } = useVideoRoom(manager, roomId);
  const debugStr = query.get("debug");
  const [debug, setDebug] = useState(debugStr === "" || debugStr === "true");

  useEffect(() => {
    function onKeyDown(event) {
      if (
        document.activeElement.tagName !== "input" &&
        event.code === "Backquote"
      ) {
        setDebug((prevDebug) => !prevDebug);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className={styles.room}>
      {!loading && room && (
        <Header>
          <LeftNav />
          <CenterNav>
            <h3>{room.name}</h3>
          </CenterNav>
          <RightNav>
            <SettingsButton
              title={debug ? "Disable DevTools" : "Enable DevTools"}
              on={debug}
              onClick={() => setDebug((debug) => !debug)}
            />
          </RightNav>
        </Header>
      )}
      {loading && (
        <div className={styles.centerMessage}>
          <p>Loading room...</p>
        </div>
      )}
      {error && <div className={styles.centerMessage}>{error.message}</div>}
      {!loading && room && !joined && (
        <JoinRoom
          manager={manager}
          joining={joining}
          joinCall={joinCall}
          toggleMuteVideo={toggleMuteVideo}
          toggleMuteMic={toggleMuteMic}
          videoMuted={videoMuted}
          micMuted={micMuted}
        />
      )}
      {!loading && room && joined && participants.length === 0 && (
        <div className={styles.centerMessage}>
          <p>Waiting for other participants...</p>
        </div>
      )}
      {!loading && room && joined && participants.length > 0 && (
        <VideoGrid participants={participants} />
      )}
      {!loading && room && joined ? children : null}
      {!loading && room && joined && (
        <div className={styles.footer}>
          <MicButton muted={micMuted} onClick={toggleMuteMic} />
          <VideoButton enabled={videoMuted} onClick={toggleMuteVideo} />
          <HangupButton onClick={leaveCall} />
        </div>
      )}
      {debug && <DevTools manager={manager} />}
    </div>
  );
}

function JoinRoom({
  joining,
  joinCall,
  manager,
  toggleMuteVideo,
  toggleMuteMic,
  videoMuted,
  micMuted,
}) {
  const videoRef = useRef();
  const [hasPermissions, setHasPermissions] = useState(false);
  const [needsPermissions, setNeedsPermissions] = useState(false);

  useEffect(() => {
    manager
      .getLocalVideoStream()
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setHasPermissions(true);
        }
      })
      .catch(() => {
        if (videoRef.current) {
          setNeedsPermissions(true);
        }
      });
  }, [manager]);

  return (
    <div className={styles.joinRoom}>
      <div className={styles.preview}>
        {needsPermissions && (
          <p className={styles.webcamPermissions}>
            Webcam permissions needed to join the call.
          </p>
        )}
        <video ref={videoRef} muted playsInline disablePictureInPicture />
      </div>
      {hasPermissions && (
        <div className={styles.previewButtons}>
          <MicButton muted={micMuted} onClick={toggleMuteMic} />
          <VideoButton enabled={videoMuted} onClick={toggleMuteVideo} />
        </div>
      )}
      <Button disabled={!hasPermissions || joining} onClick={joinCall}>
        Join Call
      </Button>
    </div>
  );
}
