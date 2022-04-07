import React from "react";
import { animated } from "@react-spring/web";
import classNames from "classnames";
import styles from "./VideoTile.module.css";
import { ReactComponent as MicMutedIcon } from "../icons/MicMuted.svg";
import { ReactComponent as VideoMutedIcon } from "../icons/VideoMuted.svg";

export function VideoTile({
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
}) {
  return (
    <animated.div
      className={classNames(styles.videoTile, className, {
        [styles.isLocal]: isLocal,
        [styles.speaking]: speaking,
        [styles.muted]: audioMuted,
        [styles.screenshare]: screenshare,
      })}
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
