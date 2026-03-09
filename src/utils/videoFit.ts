/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map, type Observable, of, switchMap } from "rxjs";
import {
  type LocalParticipant,
  type RemoteParticipant,
  Track,
} from "livekit-client";

import { type ObservableScope } from "../state/ObservableScope.ts";
import { type Behavior } from "../state/Behavior.ts";
import {
  observeInboundRtpStreamStats$,
  observeOutboundRtpStreamStats$,
} from "../state/media/observeRtpStreamStats";

type Size = {
  width: number;
  height: number;
};

/**
 * Computes the appropriate video fit mode ("cover" or "contain") based on the aspect ratios of the video and the tile.
 * - If the video and tile have the same orientation (both landscape or both portrait), we use "cover" to fill the tile, even if it means cropping.
 * - If the video and tile have different orientations, we use "contain" to ensure the entire video is visible, even if it means letterboxing (black bars).
 * @param scope - the ObservableScope to create the Behavior in
 * @param videoSize$ - an Observable of the video size (width and height) or undefined if the size is not yet known (no data yet received).
 * @param tileSize$ - an Observable of the tile size (width and height) or undefined if the size is not yet known (not yet rendered).
 */
export function videoFit$(
  scope: ObservableScope,
  videoSize$: Observable<Size | undefined>,
  tileSize$: Observable<Size | undefined>,
): Behavior<"cover" | "contain"> {
  const fit$ = combineLatest([videoSize$, tileSize$]).pipe(
    map(([videoSize, tileSize]) => {
      if (!videoSize || !tileSize) {
        // If we don't have the sizes, default to cover to avoid black bars.
        // This is a reasonable default as it will ensure the video fills the tile, even if it means cropping.
        return "cover";
      }
      if (
        videoSize.width === 0 ||
        videoSize.height === 0 ||
        tileSize.width === 0 ||
        tileSize.height === 0
      ) {
        // If we have invalid sizes (e.g. width or height is 0), default to cover to avoid black bars.
        return "cover";
      }
      const videoAspectRatio = videoSize.width / videoSize.height;
      const tileAspectRatio = tileSize.width / tileSize.height;

      // If video is landscape (ratio > 1) and tile is portrait (ratio < 1) or vice versa,
      // we want to use "contain" (fit) mode to avoid excessive cropping
      const videoIsLandscape = videoAspectRatio > 1;
      const tileIsLandscape = tileAspectRatio > 1;

      // If the orientations are the same, use the cover mode (Preserves the aspect ratio, and the image fills the container.)
      // If they're not the same orientation, use the contain mode (Preserves the aspect ratio, but the image is letterboxed - black bars- to fit within the container.)
      return videoIsLandscape === tileIsLandscape ? "cover" : "contain";
    }),
  );

  return scope.behavior(fit$, "cover");
}

/**
 * Helper function to get the video size from a participant.
 * It observes the participant's video track stats and extracts the frame width and height.
 * @param participant$ - an Observable of a LocalParticipant or RemoteParticipant, or null if no participant is selected.
 * @returns an Observable of the video size (width and height) or undefined if the size cannot be determined.
 */
export function videoSizeFromParticipant$(
  participant$: Observable<LocalParticipant | RemoteParticipant | null>,
): Observable<{ width: number; height: number } | undefined> {
  return participant$
    .pipe(
      // If we have a participant, observe their video track stats. If not, return undefined.
      switchMap((p) => {
        if (!p) return of(undefined);
        if (p.isLocal) {
          return observeOutboundRtpStreamStats$(p, Track.Source.Camera);
        } else {
          return observeInboundRtpStreamStats$(p, Track.Source.Camera);
        }
      }),
    )
    .pipe(
      // Extract the frame width and height from the stats. If we don't have valid stats, return undefined.
      map((stats) => {
        if (!stats) return undefined;
        if (
          // For video tracks, frameWidth and frameHeight should be numbers. If they're not, we can't determine the size.
          typeof stats.frameWidth !== "number" ||
          typeof stats.frameHeight !== "number"
        ) {
          return undefined;
        }
        return {
          width: stats.frameWidth,
          height: stats.frameHeight,
        };
      }),
    );
}
