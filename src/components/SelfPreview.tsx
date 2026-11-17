/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useEffect, useRef } from "react";
import { constant, type LocalVideoMediaTrack } from "@element-hq/matrixrtc-sdk";
import { VideoCallOffIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./SelfPreview.module.css";
import { useBehavior } from "../useBehavior";

const noFacingMode = constant(undefined);

interface Props {
  /** The camera as the pipeline has it, or none while the camera is off. */
  track: LocalVideoMediaTrack | null;
}

/**
 * The user's own camera with the effect in force: the pipeline's own track,
 * shown a second time rather than captured again.
 */
export const SelfPreview: FC<Props> = ({ track }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = videoRef.current;
    if (!track || !element) return;
    track.attach(element);
    // This element only: the pre-join preview may be showing the same camera
    return (): void => {
      track.detach(element);
    };
  }, [track]);
  const facingMode = useBehavior(track?.facingMode$ ?? noFacingMode);

  if (!track) return <VideoCallOffIcon width={32} height={32} />;
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      className={facingMode === "user" ? styles.mirrored : undefined}
    />
  );
};
