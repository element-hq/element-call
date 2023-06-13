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
import { MediaDevicesState } from "../settings/mediaDevices";
import { useClient } from "../ClientContext";

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

export type LocalMediaInfo = {
  audio?: MediaInfo;
  video?: MediaInfo;
};

interface Props {
  matrixInfo: MatrixInfo;
  mediaDevices: MediaDevicesState;
  localMediaInfo: LocalMediaInfo;
}

export function VideoPreview({
  matrixInfo,
  mediaDevices,
  localMediaInfo,
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
      localMediaInfo.video?.track.attach(mediaElement.current);
    }
    return () => {
      localMediaInfo.video?.track.detach();
    };
  }, [localMediaInfo.video?.track, mediaElement]);

  return (
    <div className={styles.preview} ref={previewRef}>
      <video ref={mediaElement} muted playsInline disablePictureInPicture />
      <>
        {(localMediaInfo.video?.muted ?? true) && (
          <div className={styles.avatarContainer}>
            <Avatar
              size={(previewBounds.height - 66) / 2}
              src={matrixInfo.avatarUrl}
              fallback={matrixInfo.userName.slice(0, 1).toUpperCase()}
            />
          </div>
        )}
        <div className={styles.previewButtons}>
          {localMediaInfo.audio && (
            <MicButton
              muted={localMediaInfo.audio?.muted}
              onPress={localMediaInfo.audio?.toggle}
            />
          )}
          {localMediaInfo.video && (
            <VideoButton
              muted={localMediaInfo.video?.muted}
              onPress={localMediaInfo.video?.toggle}
            />
          )}
          <SettingsButton onPress={openSettings} />
        </div>
      </>
      {settingsModalState.isOpen && (
        <SettingsModal
          client={client}
          mediaDevices={mediaDevices}
          {...settingsModalProps}
        />
      )}
    </div>
  );
}
