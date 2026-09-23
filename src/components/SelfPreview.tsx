/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useEffect, useRef } from "react";
import { facingModeFromLocalTrack, type LocalVideoTrack } from "livekit-client";
import { VideoCallOffIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./MediaMuteAndSwitchButton.module.css";

interface Props {
  /** The camera as the pipeline has it, or none while the camera is off. */
  track: LocalVideoTrack | null;
}

/**
 * The user's own camera, for the camera menu's preview.
 *
 * Attached to the same track the pipeline is synced to, so it shows whatever
 * effect is in force — the processed picture where one has been chosen, and
 * the plain one where none ever has — without a capture or a pipeline of its
 * own. A second consumer of one track, not a second track.
 */
export const SelfPreview: FC<Props> = ({ track }) => {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!track || !element) return;
    track.attach(element);
    return (): void => {
      track.detach(element);
    };
  }, [track]);

  // Nothing to show, and saying so: an effect chosen now still applies when
  // the camera comes back, so the grid below stays live.
  if (!track) return <VideoCallOffIcon width={32} height={32} />;

  return (
    <video
      ref={video}
      muted
      playsInline
      className={
        facingModeFromLocalTrack(track).facingMode === "user"
          ? styles.mirrored
          : undefined
      }
    />
  );
};
