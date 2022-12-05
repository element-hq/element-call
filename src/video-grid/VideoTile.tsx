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

import React, { forwardRef } from "react";
import { animated } from "@react-spring/web";
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
  maximised?: boolean;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  className?: string;
  showOptions?: boolean;
  isLocal?: boolean;
  disableSpeakingIndicator?: boolean;
}

export const VideoTile = forwardRef<HTMLDivElement, Props>(
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
      maximised,
      fullscreen,
      onFullscreen,
      className,
      showOptions,
      isLocal,
      // TODO: disableSpeakingIndicator is not used atm.
      disableSpeakingIndicator,
      ...rest
    },
    ref
  ) => {
    const { t } = useTranslation();

    const toolbarButtons: JSX.Element[] = [];
    if (connectionState == ConnectionState.Connected && !isLocal) {
      toolbarButtons.push(
        <AudioButton
          key="localVolume"
          className={styles.button}
          volume={localVolume}
          onPress={onOptionsPress}
        />
      );

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
        ref={ref}
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
              {audioMuted && !videoMuted && <MicMutedIcon />}
              {videoMuted && <VideoMutedIcon />}
              <span title={caption}>{caption}</span>
            </div>
          ))}
        <video ref={mediaRef} playsInline disablePictureInPicture />
      </animated.div>
    );
  }
);
