import React from "react";
import { useCallFeed } from "../video-grid/useCallFeed";
import { useMediaStream } from "../video-grid/useMediaStream";
import styles from "./PTTFeed.module.css";

export function PTTFeed({ callFeed, audioOutputDevice }) {
  const { isLocal, stream } = useCallFeed(callFeed);
  const mediaRef = useMediaStream(stream, audioOutputDevice, isLocal);
  return <audio ref={mediaRef} className={styles.audioFeed} playsInline />;
}
