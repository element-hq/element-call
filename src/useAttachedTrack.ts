/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RefObject, useEffect, useRef } from "react";

import { type ShownCamera } from "./tracks/cameraTrack";

/**
 * Shows a camera in the video element given the returned ref, and says
 * whether to mirror it, as a camera facing the user is. Only that element is
 * detached again: another may be showing the same camera.
 */
export function useAttachedTrack(camera: ShownCamera | null): {
  videoRef: RefObject<HTMLVideoElement | null>;
  mirrored: boolean;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = videoRef.current;
    if (!camera || !element) return;
    camera.attach(element);
    return (): void => {
      camera.detach(element);
    };
  }, [camera]);
  return { videoRef, mirrored: camera?.facesUser() ?? false };
}
