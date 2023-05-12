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

import styles from "./VideoTile.module.css";
import { ReactComponent as MicMutedIcon } from "../icons/MicMuted.svg";
import { ReactComponent as VideoMutedIcon } from "../icons/VideoMuted.svg";
import { AudioButton, FullscreenButton } from "../button/Button";
import { ConnectionState } from "../room/useGroupCall";

interface Props {
  name: string;
  connectionState: ConnectionState;
  speaking?: boolean;
  audioMuted?: boolean;
  videoMuted?: boolean;
  screenshare?: boolean;
  avatar?: JSX.Element;
  mediaRef?: React.RefObject<MediaElement>;
  onOptionsPress?: () => void;
  localVolume?: number;
  hasAudio?: boolean;
  maximised?: boolean;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  className?: string;
  showOptions?: boolean;
  isLocal?: boolean;
  disableSpeakingIndicator?: boolean;
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
      connectionState,
      speaking,
      audioMuted,
      videoMuted,
      screenshare,
      avatar,
      mediaRef,
      onOptionsPress,
      localVolume,
      hasAudio,
      maximised,
      fullscreen,
      onFullscreen,
      className,
      showOptions,
      isLocal,
      // TODO: disableSpeakingIndicator is not used atm.
      disableSpeakingIndicator,
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

    const toolbarButtons: JSX.Element[] = [];
    if (connectionState == ConnectionState.Connected && !isLocal) {
      if (hasAudio) {
        toolbarButtons.push(
          <AudioButton
            key="localVolume"
            className={styles.button}
            volume={localVolume}
            onPress={onOptionsPress}
          />
        );
      }

      if (screenshare) {
        toolbarButtons.push(
          <FullscreenButton
            key="fullscreen"
            className={styles.button}
            fullscreen={fullscreen}
            onPress={onFullscreen}
          />
        );
      }
    }

    let caption: string;
    switch (connectionState) {
      case ConnectionState.EstablishingCall:
        caption = t("{{name}} (Connecting...)", { name });
        break;
      case ConnectionState.WaitMedia:
        // not strictly true, but probably easier to understand than, "Waiting for media"
        caption = t("{{name}} (Waiting for video...)", { name });
        break;
      case ConnectionState.Connected:
        caption = name;
        break;
    }

    return (
      <animated.div
        className={classNames(styles.videoTile, className, {
          [styles.isLocal]: isLocal,
          [styles.speaking]: speaking,
          [styles.muted]: audioMuted,
          [styles.screenshare]: screenshare,
          [styles.maximised]: maximised,
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
        {toolbarButtons.length > 0 && !maximised && (
          <div className={classNames(styles.toolbar)}>{toolbarButtons}</div>
        )}
        {videoMuted && (
          <>
            <div className={styles.videoMutedOverlay} />
            {avatar}
          </>
        )}
        {!maximised &&
          (screenshare ? (
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
                audioMuted && !videoMuted && !speaking && <MicMutedIcon />
              }
              {videoMuted && <VideoMutedIcon />}
              <span data-testid="videoTile_caption" title={caption}>
                {caption}
              </span>
            </div>
          ))}
        <video
          data-testid="videoTile_video"
          ref={mediaRef}
          playsInline
          disablePictureInPicture
        />
      </animated.div>
    );
  }
);
