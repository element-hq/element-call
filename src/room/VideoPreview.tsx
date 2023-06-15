/*
Copyright 2022 - 2023 New Vector Ltd

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

import React, { useCallback } from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { Track } from "livekit-client";
import { OverlayTriggerState } from "@react-stately/overlays";

import { MicButton, SettingsButton, VideoButton } from "../button";
import { Avatar } from "../Avatar";
import styles from "./VideoPreview.module.css";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { useClient } from "../ClientContext";
import {
  LocalMediaTracks,
  LocalUserChoices,
  MediaDevicesList,
} from "../livekit/useLiveKit";

export type MatrixInfo = {
  userName: string;
  avatarUrl: string;
  roomName: string;
  roomIdOrAlias: string;
};

export type MediaInfo = {
  track: Track; // TODO: Replace it by a more generic `CallFeed` type from JS SDK once we generalise the types.
  muted: boolean;
  toggle: () => void;
};

interface Props {
  matrixInfo: MatrixInfo;
  mediaDevices: MediaDevicesList;
  mediaTracks: LocalMediaTracks;
  userChoices: LocalUserChoices;
}

export function VideoPreview({
  matrixInfo,
  mediaDevices,
  mediaTracks,
  userChoices,
}: Props) {
  const { client } = useClient();
  const [previewRef, previewBounds] = useMeasure({ polyfill: ResizeObserver });

  const {
    modalState: settingsModalState,
    modalProps: settingsModalProps,
  }: {
    modalState: OverlayTriggerState;
    modalProps: {
      isOpen: boolean;
      onClose: () => void;
    };
  } = useModalTriggerState();

  const openSettings = useCallback(() => {
    settingsModalState.open();
  }, [settingsModalState]);

  const mediaElement = React.useRef(null);
  React.useEffect(() => {
    if (mediaElement.current) {
      mediaTracks.video?.attach(mediaElement.current);
    }
    return () => {
      mediaTracks.video?.detach();
    };
  }, [mediaTracks.video, mediaElement]);

  return (
    <div className={styles.preview} ref={previewRef}>
      <video ref={mediaElement} muted playsInline disablePictureInPicture />
      <>
        {(!userChoices.videoEnabled ?? true) && (
          <div className={styles.avatarContainer}>
            <Avatar
              size={(previewBounds.height - 66) / 2}
              src={matrixInfo.avatarUrl}
              fallback={matrixInfo.userName.slice(0, 1).toUpperCase()}
            />
          </div>
        )}
        <div className={styles.previewButtons}>
          {mediaTracks.audio && (
            <MicButton
              muted={!userChoices.audioEnabled}
              onPress={() => {
                userChoices.setAudioEnabled(!userChoices.audioEnabled);
              }}
            />
          )}
          {mediaTracks.video && (
            <VideoButton
              muted={!userChoices.videoEnabled}
              onPress={() => {
                userChoices.setVideoEnabled(!userChoices.videoEnabled);
              }}
            />
          )}
          <SettingsButton onPress={openSettings} />
        </div>
      </>
      {settingsModalState.isOpen && (
        <SettingsModal
          userChoices={userChoices}
          client={client}
          mediaDevices={mediaDevices}
          {...settingsModalProps}
        />
      )}
    </div>
  );
}
