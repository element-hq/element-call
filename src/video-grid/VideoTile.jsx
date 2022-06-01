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
import styles from "./VideoTile.module.css";
import { ReactComponent as MicMutedIcon } from "../icons/MicMuted.svg";
import { ReactComponent as VideoMutedIcon } from "../icons/VideoMuted.svg";

export const VideoTile = forwardRef(
  (
    {
      className,
      isLocal,
      speaking,
      audioMuted,
      noVideo,
      videoMuted,
      screenshare,
      avatar,
      name,
      showName,
      mediaRef,
      ...rest
    },
    ref
  ) => {
    return (
      <animated.div
        className={classNames(styles.videoTile, className, {
          [styles.isLocal]: isLocal,
          [styles.speaking]: speaking,
          [styles.muted]: audioMuted,
          [styles.screenshare]: screenshare,
        })}
        ref={ref}
        {...rest}
      >
        {(videoMuted || noVideo) && (
          <>
            <div className={styles.videoMutedOverlay} />
            {avatar}
          </>
        )}
        {screenshare ? (
          <div className={styles.presenterLabel}>
            <span>{`${name} is presenting`}</span>
          </div>
        ) : (
          (showName || audioMuted || (videoMuted && !noVideo)) && (
            <div className={styles.memberName}>
              {audioMuted && !(videoMuted && !noVideo) && <MicMutedIcon />}
              {videoMuted && !noVideo && <VideoMutedIcon />}
              {showName && <span title={name}>{name}</span>}
            </div>
          )
        )}
        <video ref={mediaRef} playsInline disablePictureInPicture />
      </animated.div>
    );
  }
);
