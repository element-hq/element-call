import React, { useEffect } from "react";
import styles from "./LobbyView.module.css";
import { Button, CopyButton, MicButton, VideoButton } from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { useCallFeed } from "matrix-react-sdk/src/hooks/useCallFeed";
import { useMediaStream } from "matrix-react-sdk/src/hooks/useMediaStream";
import { getRoomUrl } from "../ConferenceCallManagerHooks";
import { OverflowMenu } from "./OverflowMenu";
import { UserMenuContainer } from "../UserMenuContainer";
import { Body, Link } from "../typography/Typography";

export function LobbyView({
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
          <UserMenuContainer />
        </RightNav>
      </Header>
      <div className={styles.joinRoom}>
        <div className={styles.joinRoomContent}>
          <div className={styles.preview}>
            <video ref={videoRef} muted playsInline disablePictureInPicture />
            {state === GroupCallState.LocalCallFeedUninitialized && (
              <Body fontWeight="semiBold" className={styles.webcamPermissions}>
                Webcam/microphone permissions needed to join the call.
              </Body>
            )}
            {state === GroupCallState.InitializingLocalCallFeed && (
              <Body fontWeight="semiBold" className={styles.webcamPermissions}>
                Accept webcam/microphone permissions to join the call.
              </Body>
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
          <Body>Or</Body>
          <CopyButton
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
