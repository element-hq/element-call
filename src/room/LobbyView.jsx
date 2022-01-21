import React, { useEffect } from "react";
import styles from "./LobbyView.module.css";
import { Button, CopyButton, MicButton, VideoButton } from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { useCallFeed } from "matrix-react-sdk/src/hooks/useCallFeed";
import { useMediaStream } from "matrix-react-sdk/src/hooks/useMediaStream";
import { getRoomUrl } from "../matrix-utils";
import { OverflowMenu } from "./OverflowMenu";
import { UserMenuContainer } from "../UserMenuContainer";
import { Body, Link } from "../typography/Typography";
import { Avatar } from "../Avatar";
import { getAvatarUrl } from "../matrix-utils";
import { useProfile } from "../profile/useProfile";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";

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
  const { displayName, avatarUrl } = useProfile(client);
  const [previewRef, previewBounds] = useMeasure({ polyfill: ResizeObserver });
  const avatarSize = (previewBounds.height - 66) / 2;

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
          <div className={styles.preview} ref={previewRef}>
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
                {localVideoMuted && (
                  <div className={styles.avatarContainer}>
                    <Avatar
                      style={{
                        width: avatarSize,
                        height: avatarSize,
                        borderRadius: avatarSize,
                        fontSize: Math.round(avatarSize / 2),
                      }}
                      src={avatarUrl && getAvatarUrl(client, avatarUrl, 96)}
                      fallback={displayName.slice(0, 1).toUpperCase()}
                    />
                  </div>
                )}
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
