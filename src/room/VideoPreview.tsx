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

import React, { useState, useEffect, useCallback } from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { OverlayTriggerState } from "@react-stately/overlays";
import { usePreviewTracks } from "@livekit/components-react";
import { LocalAudioTrack, LocalVideoTrack, Track } from "livekit-client";

import { MicButton, SettingsButton, VideoButton } from "../button";
import { Avatar } from "../Avatar";
import styles from "./VideoPreview.module.css";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { useClient } from "../ClientContext";
import { useMediaDevicesSwitcher } from "../livekit/useMediaDevices";
import { DeviceChoices, UserChoices } from "../livekit/useLiveKit";
import { useDefaultDevices } from "../settings/useSetting";

export type MatrixInfo = {
  displayName: string;
  avatarUrl: string;
  roomName: string;
  roomIdOrAlias: string;
};

interface Props {
  matrixInfo: MatrixInfo;
  onUserChoicesChanged: (choices: UserChoices) => void;
}

export function VideoPreview({ matrixInfo, onUserChoicesChanged }: Props) {
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

  // Create local media tracks.
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [defaultDevices] = useDefaultDevices();
  // const video = usePreviewDevice(
  //   videoEnabled,
  //   videoId != "" ? videoId : defaultDevices.videoinput,
  //   "videoinput"
  // );
  // const audio = usePreviewDevice(
  //   audioEnabled,
  //   audioId != "" ? audioId : defaultDevices.audioinput,
  //   "audioinput"
  // );

  const tracks = usePreviewTracks(
    {
      audio: audioEnabled ? { deviceId: defaultDevices.videoinput } : false,
      video: videoEnabled ? { deviceId: defaultDevices.audioinput } : false,
    },
    () => {
      console.log("TODO handle error");
    }
  );
  const videoTrack = React.useMemo(
    () =>
      tracks?.filter(
        (track) => track.kind === Track.Kind.Video
      )[0] as LocalVideoTrack,
    [tracks]
  );
  const audioTrack = React.useMemo(
    () =>
      tracks?.filter(
        (track) => track.kind === Track.Kind.Audio
      )[0] as LocalAudioTrack,
    [tracks]
  );
  // Fetch user media devices.
  const mediaSwitcher = useMediaDevicesSwitcher(undefined, {
    videoTrack,
    audioTrack,
  });
  const [activeVideoId, activeAudioId] = [
    mediaSwitcher.videoIn.selectedId,
    mediaSwitcher.audioIn.selectedId,
  ];

  const videoEl = React.useRef(null);

  // const activeVideoId = videoTrack?.selectedDevice?.deviceId;
  // const activeAudioId = audio?.selectedDevice?.deviceId;
  useEffect(() => {
    const createChoices = (
      enabled: boolean,
      deviceId?: string
    ): DeviceChoices | undefined => {
      if (deviceId === undefined) {
        return undefined;
      }

      return {
        selectedId: deviceId,
        enabled,
      };
    };

    onUserChoicesChanged({
      video: createChoices(videoEnabled, activeVideoId),
      audio: createChoices(audioEnabled, activeAudioId),
    });
  }, [
    onUserChoicesChanged,
    activeVideoId,
    videoEnabled,
    activeAudioId,
    audioEnabled,
  ]);

  const [selectVideo, selectAudio] = [
    mediaSwitcher.videoIn.setSelected,
    mediaSwitcher.audioIn.setSelected,
  ];
  useEffect(() => {
    if (activeVideoId && activeVideoId !== "") {
      selectVideo(activeVideoId);
    }
    if (activeAudioId && activeAudioId !== "") {
      selectAudio(activeAudioId);
    }
  }, [selectVideo, selectAudio, activeVideoId, activeAudioId]);

  useEffect(() => {
    if (videoEl.current) {
      videoTrack.unmute();

      videoTrack?.attach(videoEl.current);
    }
    return () => {
      videoTrack?.detach();
    };
  }, [videoTrack]);

  return (
    <div className={styles.preview} ref={previewRef}>
      <video ref={videoEl} muted playsInline disablePictureInPicture />
      <>
        {(videoTrack ? !videoEnabled : true) && (
          <div className={styles.avatarContainer}>
            <Avatar
              size={(previewBounds.height - 66) / 2}
              src={matrixInfo.avatarUrl}
              fallback={matrixInfo.displayName.slice(0, 1).toUpperCase()}
            />
          </div>
        )}
        <div className={styles.previewButtons}>
          {audioTrack && (
            <MicButton
              muted={!audioEnabled}
              onPress={() => setAudioEnabled(!audioEnabled)}
            />
          )}
          {videoTrack && (
            <VideoButton
              muted={!videoEnabled}
              onPress={() => setVideoEnabled(!videoEnabled)}
            />
          )}
          <SettingsButton onPress={openSettings} />
        </div>
      </>
      {settingsModalState.isOpen && (
        <SettingsModal
          client={client}
          mediaDevicesSwitcher={mediaSwitcher}
          {...settingsModalProps}
        />
      )}
    </div>
  );
}
