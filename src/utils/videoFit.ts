/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Computes the appropriate video fit mode ("cover" or "contain") based on the aspect ratios of the video and the tile.
 * - If the video and tile have the same orientation (both landscape or both portrait), we use "cover" to fill the tile, even if it means cropping.
 * - If the video and tile have different orientations, we use "contain" to ensure the entire video is visible, even if it means letterboxing (black bars).
 */
export function autoVideoFit(
  videoAspectRatio: number,
  tileAspectRatio: number,
): "cover" | "contain" {
  if (Number.isNaN(videoAspectRatio) || Number.isNaN(tileAspectRatio)) {
    // If we have invalid sizes (e.g. useMeasure returns 0×0 on an initial render),
    // default to cover to avoid black bars.
    return "cover";
  }

  // If video is landscape (ratio > 1) and tile is portrait (ratio < 1) or vice versa,
  // we want to use "contain" (fit) mode to avoid excessive cropping
  const videoIsLandscape = videoAspectRatio > 1;
  const tileIsLandscape = tileAspectRatio > 1;

  // If the orientations are the same, use the cover mode (Preserves the aspect ratio, and the image fills the container.)
  // If they're not the same orientation, use the contain mode (Preserves the aspect ratio, but the image is letterboxed - black bars- to fit within the container.)
  return videoIsLandscape === tileIsLandscape ? "cover" : "contain";
}
