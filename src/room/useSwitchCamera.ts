/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  fromEvent,
  map,
  merge,
  Observable,
  of,
  startWith,
  switchMap,
} from "rxjs";
import {
  facingModeFromLocalTrack,
  LocalVideoTrack,
  TrackEvent,
} from "livekit-client";
import { useObservable, useObservableEagerState } from "observable-hooks";
import { useEffect } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import { useMediaDevices } from "../livekit/MediaDevicesContext";
import { platform } from "../Platform";
import { useLatest } from "../useLatest";

/**
 * Determines whether the user should be shown a button to switch their camera,
 * producing a callback if so.
 */
export function useSwitchCamera(
  video: Observable<LocalVideoTrack | null>,
): (() => void) | null {
  const mediaDevices = useMediaDevices();

  // Produce an observable like the input 'video' observable, except make it
  // emit whenever the track is muted or the device changes
  const videoTrack: Observable<LocalVideoTrack | null> = useObservable(
    (inputs) =>
      inputs.pipe(
        switchMap(([video]) => video),
        switchMap((video) => {
          if (video === null) return of(null);
          return merge(
            fromEvent(video, TrackEvent.Restarted).pipe(
              startWith(null),
              map(() => video),
            ),
            fromEvent(video, TrackEvent.Muted).pipe(map(() => null)),
          );
        }),
      ),
    [video],
  );

  const switchCamera: Observable<(() => void) | null> = useObservable(
    (inputs) =>
      platform === "desktop"
        ? of(null)
        : inputs.pipe(
            switchMap(([track]) => track),
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
                  .catch((e) =>
                    logger.error("Failed to switch camera", facingMode, e),
                  );
            }),
          ),
    [videoTrack],
  );

  const setVideoInput = useLatest(mediaDevices.videoInput.select);
  useEffect(() => {
    // Watch for device changes due to switching the camera and feed them back
    // into the MediaDeviceContext
    const subscription = videoTrack.subscribe((track) => {
      const deviceId = track?.mediaStreamTrack.getSettings().deviceId;
      if (deviceId !== undefined) setVideoInput.current(deviceId);
    });
    return (): void => subscription.unsubscribe();
  }, [videoTrack, setVideoInput]);

  return useObservableEagerState(switchCamera);
}
