import React, { useEffect, useRef } from "react";
import styles from "./LobbyView.module.css";
import { Button, CopyButton } from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { useCallFeed } from "../video-grid/useCallFeed";
import { getRoomUrl } from "../matrix-utils";
import { UserMenuContainer } from "../UserMenuContainer";
import { Body, Link } from "../typography/Typography";
import { useLocationNavigation } from "../useLocationNavigation";
import { useMediaHandler } from "../settings/useMediaHandler";
import { VideoPreview } from "./VideoPreview";
import { AudioPreview } from "./AudioPreview";

export function LobbyView({
  client,
  groupCall,
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
  const {
    audioInput,
    audioInputs,
    setAudioInput,
    audioOutput,
    audioOutputs,
    setAudioOutput,
  } = useMediaHandler();

  useEffect(() => {
    onInitLocalCallFeed();
  }, [onInitLocalCallFeed]);

  useLocationNavigation(state === GroupCallState.InitializingLocalCallFeed);

  const joinCallButtonRef = useRef();

  useEffect(() => {
    if (state === GroupCallState.LocalCallFeedInitialized) {
      joinCallButtonRef.current.focus();
    }
  }, [state]);

  return (
    <div className={styles.room}>
      <Header>
        <LeftNav>
          <RoomHeaderInfo roomName={roomName} />
        </LeftNav>
        <RightNav>
          <UserMenuContainer />
        </RightNav>
      </Header>
      <div className={styles.joinRoom}>
        <div className={styles.joinRoomContent}>
          {groupCall.isPtt ? (
            <AudioPreview
              roomName={roomName}
              state={state}
              audioInput={audioInput}
              audioInputs={audioInputs}
              setAudioInput={setAudioInput}
              audioOutput={audioOutput}
              audioOutputs={audioOutputs}
              setAudioOutput={setAudioOutput}
            />
          ) : (
            <VideoPreview
              state={state}
              client={client}
              microphoneMuted={microphoneMuted}
              localVideoMuted={localVideoMuted}
              toggleLocalVideoMuted={toggleLocalVideoMuted}
              toggleMicrophoneMuted={toggleMicrophoneMuted}
              setShowInspector={setShowInspector}
              showInspector={showInspector}
              stream={stream}
              audioOutput={audioOutput}
            />
          )}
          <Button
            ref={joinCallButtonRef}
            className={styles.copyButton}
            size="lg"
            disabled={state !== GroupCallState.LocalCallFeedInitialized}
            onPress={onEnter}
          >
            Join call now
          </Button>
          <Body>Or</Body>
          <CopyButton
            variant="secondaryCopy"
            value={getRoomUrl(roomId)}
            className={styles.copyButton}
            copiedMessage="Call link copied"
          >
            Copy call link and join later
          </CopyButton>
        </div>
        <Body className={styles.joinRoomFooter}>
          <Link color="primary" to="/">
            Take me Home
          </Link>
        </Body>
      </div>
    </div>
  );
}
