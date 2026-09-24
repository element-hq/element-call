/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { VideoCallOffIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./SelfPreview.module.css";
import { useAttachedTrack } from "../useAttachedTrack";
import { type ShownCamera } from "../tracks/cameraTrack";

interface Props {
  /** The camera as the pipeline has it, or none while the camera is off. */
  track: ShownCamera | null;
}

/**
 * The user's own camera with the effect in force: the pipeline's own track,
 * shown a second time rather than captured again.
 */
export const SelfPreview: FC<Props> = ({ track }) => {
  const { videoRef, mirrored } = useAttachedTrack(track);

  if (!track) return <VideoCallOffIcon width={32} height={32} />;
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      className={mirrored ? styles.mirrored : undefined}
    />
  );
};
