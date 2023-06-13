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

import React, { ForwardedRef, forwardRef } from "react";
import { animated, SpringValue } from "@react-spring/web";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { LocalParticipant, RemoteParticipant, Track } from "livekit-client";
import {
  ConnectionQualityIndicator,
  VideoTrack,
  useMediaTrack,
} from "@livekit/components-react";

import styles from "./VideoTile.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { ReactComponent as MicMutedIcon } from "../icons/MicMuted.svg";

export enum TileContent {
  UserMedia = "user-media",
  ScreenShare = "screen-share",
}

interface Props {
  name: string;
  sfuParticipant: LocalParticipant | RemoteParticipant;
  content: TileContent;

  // TODO: Refactor this set of props.
  // See https://github.com/vector-im/element-call/pull/1099#discussion_r1226863404
  avatar?: JSX.Element;
  className?: string;
  opacity?: SpringValue<number>;
  scale?: SpringValue<number>;
  shadow?: SpringValue<number>;
  shadowSpread?: SpringValue<number>;
  zIndex?: SpringValue<number>;
  x?: SpringValue<number>;
  y?: SpringValue<number>;
  width?: SpringValue<number>;
  height?: SpringValue<number>;
}

export const VideoTile = forwardRef<HTMLElement, Props>(
  (
    {
      name,
      sfuParticipant,
      content,
      avatar,
      className,
      opacity,
      scale,
      shadow,
      shadowSpread,
      zIndex,
      x,
      y,
      width,
      height,
      ...rest
    },
    ref
  ) => {
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
          [styles.screenshare]: content === TileContent.ScreenShare,
        })}
        style={{
          opacity,
          scale,
          zIndex,
          x,
          y,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore React does in fact support assigning custom properties,
          // but React's types say no
          "--tileWidth": width?.to((w) => `${w}px`),
          "--tileHeight": height?.to((h) => `${h}px`),
          "--tileShadow": shadow?.to((s) => `${s}px`),
          "--tileShadowSpread": shadowSpread?.to((s) => `${s}px`),
        }}
        ref={ref as ForwardedRef<HTMLDivElement>}
        data-testid="videoTile"
        {...rest}
      >
        {!sfuParticipant.isCameraEnabled && (
          <>
            <div className={styles.videoMutedOverlay} />
            {avatar}
          </>
        )}
        {sfuParticipant.isScreenShareEnabled ? (
          <div className={styles.presenterLabel}>
            <span>{t("{{name}} is presenting", { name })}</span>
          </div>
        ) : (
          <div className={classNames(styles.infoBubble, styles.memberName)}>
            {microphoneMuted ? <MicMutedIcon /> : <MicIcon />}
            <span title={name}>{name}</span>
            <ConnectionQualityIndicator participant={sfuParticipant} />
          </div>
        )}
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
