/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RefObject, useEffect, useRef } from "react";
import { facingModeFromLocalTrack, type LocalVideoTrack } from "livekit-client";

/**
 * Shows a camera track in the video element given the returned ref, and says
 * whether to mirror it, as a camera facing the user is. Only that element is
 * detached again: another may be showing the same track.
 */
export function useAttachedTrack(track: LocalVideoTrack | null): {
  videoRef: RefObject<HTMLVideoElement | null>;
  mirrored: boolean;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = videoRef.current;
    if (!track || !element) return;
    track.attach(element);
    return (): void => {
      track.detach(element);
    };
  }, [track]);
  return {
    videoRef,
    mirrored:
      track !== null && facingModeFromLocalTrack(track).facingMode === "user",
  };
}
