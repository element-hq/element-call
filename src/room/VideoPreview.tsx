/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import React from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { MatrixClient } from "matrix-js-sdk/src/client";

import { MicButton, VideoButton } from "../button";
import { useMediaStream } from "../video-grid/useMediaStream";
import { OverflowMenu } from "./OverflowMenu";
import { Avatar } from "../Avatar";
import { useProfile } from "../profile/useProfile";
import styles from "./VideoPreview.module.css";
import { Body } from "../typography/Typography";
import { useModalTriggerState } from "../Modal";

interface Props {
  client: MatrixClient;
  state: GroupCallState;
  roomIdOrAlias: string;
  microphoneMuted: boolean;
  localVideoMuted: boolean;
  toggleLocalVideoMuted: () => void;
  toggleMicrophoneMuted: () => void;
  audioOutput: string;
  stream: MediaStream;
}
export function VideoPreview({
  client,
  state,
  roomIdOrAlias,
  microphoneMuted,
  localVideoMuted,
  toggleLocalVideoMuted,
  toggleMicrophoneMuted,
  audioOutput,
  stream,
}: Props) {
  const videoRef = useMediaStream(stream, audioOutput, true);
  const { displayName, avatarUrl } = useProfile(client);
  const [previewRef, previewBounds] = useMeasure({ polyfill: ResizeObserver });
  const avatarSize = (previewBounds.height - 66) / 2;

  const { modalState: feedbackModalState, modalProps: feedbackModalProps } =
    useModalTriggerState();

  return (
    <div className={styles.preview} ref={previewRef}>
      <video ref={videoRef} muted playsInline disablePictureInPicture />
      {state === GroupCallState.LocalCallFeedUninitialized && (
        <Body fontWeight="semiBold" className={styles.cameraPermissions}>
          Camera/microphone permissions needed to join the call.
        </Body>
      )}
      {state === GroupCallState.InitializingLocalCallFeed && (
        <Body fontWeight="semiBold" className={styles.cameraPermissions}>
          Accept camera/microphone permissions to join the call.
        </Body>
      )}
      {state === GroupCallState.LocalCallFeedInitialized && (
        <>
          {localVideoMuted && (
            <div className={styles.avatarContainer}>
              <Avatar
                size={avatarSize}
                src={avatarUrl}
                fallback={displayName.slice(0, 1).toUpperCase()}
              />
            </div>
          )}
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
              roomIdOrAlias={roomIdOrAlias}
              feedbackModalState={feedbackModalState}
              feedbackModalProps={feedbackModalProps}
              inCall={false}
              groupCall={undefined}
              showInvite={false}
            />
          </div>
        </>
      )}
    </div>
  );
}
