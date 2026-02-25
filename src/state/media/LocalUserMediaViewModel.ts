/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  facingModeFromLocalTrack,
  type LocalParticipant,
  LocalVideoTrack,
  TrackEvent,
} from "livekit-client";
import {
  fromEvent,
  map,
  merge,
  type Observable,
  of,
  startWith,
  switchMap,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "../Behavior";
import {
  type BaseUserMediaInputs,
  type BaseUserMediaViewModel,
  createBaseUserMedia,
} from "./UserMediaViewModel";
import { type ObservableScope } from "../ObservableScope";
import { alwaysShowSelf } from "../../settings/settings";
import { platform } from "../../Platform";
import { type MediaDevices } from "../MediaDevices";

export interface LocalUserMediaViewModel extends BaseUserMediaViewModel {
  local: true;
  /**
   * Whether the video should be mirrored.
   */
  mirror$: Behavior<boolean>;
  /**
   * Whether to show this tile in a highly visible location near the start of
   * the grid.
   */
  alwaysShow$: Behavior<boolean>;
  setAlwaysShow: (value: boolean) => void;
  switchCamera$: Behavior<(() => void) | null>;
}

export interface LocalUserMediaInputs extends Omit<
  BaseUserMediaInputs,
  "statsType"
> {
  participant$: Behavior<LocalParticipant | null>;
  mediaDevices: MediaDevices;
}

export function createLocalUserMedia(
  scope: ObservableScope,
  { mediaDevices, ...inputs }: LocalUserMediaInputs,
): LocalUserMediaViewModel {
  const baseUserMedia = createBaseUserMedia(scope, {
    ...inputs,
    statsType: "outbound-rtp",
  });

  /**
   * The local video track as an observable that emits whenever the track
   * changes, the camera is switched, or the track is muted.
   */
  const videoTrack$: Observable<LocalVideoTrack | null> =
    baseUserMedia.video$.pipe(
      switchMap((v) => {
        const track = v?.publication.track;
        if (!(track instanceof LocalVideoTrack)) return of(null);
        return merge(
          // Watch for track restarts because they indicate a camera switch.
          // This event is also emitted when unmuting the track object.
          fromEvent(track, TrackEvent.Restarted).pipe(
            startWith(null),
            map(() => track),
          ),
          // When the track object is muted, reset it to null.
          fromEvent(track, TrackEvent.Muted).pipe(map(() => null)),
        );
      }),
    );

  return {
    ...baseUserMedia,
    local: true,
    mirror$: scope.behavior(
      videoTrack$.pipe(
        // Mirror only front-facing cameras (those that face the user)
        map(
          (track) =>
            track !== null &&
            facingModeFromLocalTrack(track).facingMode === "user",
        ),
      ),
    ),
    alwaysShow$: alwaysShowSelf.value$,
    setAlwaysShow: alwaysShowSelf.setValue,
    switchCamera$: scope.behavior(
      platform === "desktop"
        ? of(null)
        : videoTrack$.pipe(
            map((track) => {
              if (track === null) return null;
              const facingMode = facingModeFromLocalTrack(track).facingMode;
              // If the camera isn't front or back-facing, don't provide a switch
              // camera shortcut at all
              if (facingMode !== "user" && facingMode !== "environment")
                return null;
              // Restart the track with a camera facing the opposite direction
              return (): void =>
                void track
                  .restartTrack({
                    facingMode: facingMode === "user" ? "environment" : "user",
                  })
                  .then(() => {
                    // Inform the MediaDevices which camera was chosen
                    const deviceId =
                      track.mediaStreamTrack.getSettings().deviceId;
                    if (deviceId !== undefined)
                      mediaDevices.videoInput.select(deviceId);
                  })
                  .catch((e) =>
                    logger.error("Failed to switch camera", facingMode, e),
                  );
            }),
          ),
    ),
  };
}
