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
import { useMediaTrack } from "@livekit/components-react";

import styles from "./VideoTile.module.css";
import { ReactComponent as MicMutedIcon } from "../icons/MicMuted.svg";
import { ReactComponent as VideoMutedIcon } from "../icons/VideoMuted.svg";

interface Props {
  name: string;
  avatar?: JSX.Element;
  maximised?: boolean;
  className?: string;
  sfuParticipant: LocalParticipant | RemoteParticipant;
}

export const VideoTile = forwardRef<HTMLDivElement, Props>(
  ({ name, avatar, maximised, className, sfuParticipant, ...rest }, ref) => {
    const { t } = useTranslation();

    const videoEl = React.useRef<HTMLVideoElement>(null);
    const { isMuted: cameraMuted } = useMediaTrack(
      Track.Source.Camera,
      sfuParticipant,
      {
        element: videoEl,
      }
    );

    const audioEl = React.useRef<HTMLAudioElement>(null);
    const { isMuted: microphoneMuted } = useMediaTrack(
      Track.Source.Microphone,
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
          [styles.maximised]: maximised,
        })}
        ref={ref}
        {...rest}
      >
        {cameraMuted && (
          <>
            <div className={styles.videoMutedOverlay} />
            {avatar}
          </>
        )}
        {!maximised &&
          (sfuParticipant.isScreenShareEnabled ? (
            <div className={styles.presenterLabel}>
              <span>{t("{{name}} is presenting", { name })}</span>
            </div>
          ) : (
            <div className={classNames(styles.infoBubble, styles.memberName)}>
              {
                /* If the user is speaking, it's safe to say they're unmuted.
                Mute state is currently sent over to-device messages, which
                aren't quite real-time, so this is an important kludge to make
                sure no one appears muted when they've clearly begun talking. */
                microphoneMuted &&
                  !cameraMuted &&
                  !sfuParticipant.isSpeaking && <MicMutedIcon />
              }
              {cameraMuted && <VideoMutedIcon />}
            </div>
          ))}
        <video ref={videoEl} />
        <audio ref={audioEl} />
      </animated.div>
    );
  }
);
