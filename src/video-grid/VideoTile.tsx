/*
Copyright 2022 New Vector Ltd

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

import React, { forwardRef } from "react";
import { animated } from "@react-spring/web";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { LocalParticipant, RemoteParticipant, Track } from "livekit-client";
import {
  ConnectionQualityIndicator,
  VideoTrack,
  useMediaTrack,
} from "@livekit/components-react";

import styles from "./VideoTile.module.css";
import { ReactComponent as MicMutedIcon } from "../icons/MicMuted.svg";
import { ReactComponent as VideoMutedIcon } from "../icons/VideoMuted.svg";

export enum TileContent {
  UserMedia = "user-media",
  ScreenShare = "screen-share",
}

interface Props {
  avatar?: JSX.Element;
  className?: string;

  name: string;
  sfuParticipant: LocalParticipant | RemoteParticipant;
  content: TileContent;
}

export const VideoTile = forwardRef<HTMLDivElement, Props>(
  ({ name, avatar, className, sfuParticipant, content, ...rest }, ref) => {
    const { t } = useTranslation();

    const audioEl = React.useRef<HTMLAudioElement>(null);
    const { isMuted: microphoneMuted } = useMediaTrack(
      content === TileContent.UserMedia
        ? Track.Source.Microphone
        : Track.Source.ScreenShareAudio,
      sfuParticipant,
      {
        element: audioEl,
      }
    );

    return (
      <animated.div
        className={classNames(styles.videoTile, className, {
          [styles.isLocal]: sfuParticipant.isLocal,
          [styles.speaking]: sfuParticipant.isSpeaking,
          [styles.muted]: microphoneMuted,
          [styles.screenshare]: false,
        })}
        ref={ref}
        {...rest}
      >
        {!sfuParticipant.isCameraEnabled && (
          <>
            <div className={styles.videoMutedOverlay} />
            {avatar}
          </>
        )}
        {!false &&
          (sfuParticipant.isScreenShareEnabled ? (
            <div className={styles.presenterLabel}>
              <span>{t("{{name}} is presenting", { name })}</span>
            </div>
          ) : (
            <div className={classNames(styles.infoBubble, styles.memberName)}>
              {microphoneMuted && <MicMutedIcon />}
              {!sfuParticipant.isCameraEnabled && <VideoMutedIcon />}
              <span title={name}>{name}</span>
              <ConnectionQualityIndicator participant={sfuParticipant} />
            </div>
          ))}
        <VideoTrack
          participant={sfuParticipant}
          source={
            content === TileContent.UserMedia
              ? Track.Source.Camera
              : Track.Source.ScreenShare
          }
        />
        <audio ref={audioEl} />
      </animated.div>
    );
  }
);
