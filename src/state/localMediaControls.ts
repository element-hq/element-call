/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Behavior,
  type LocalMediaTrack,
  type LocalVideoMediaTrack,
  type ObservableScope,
  type VideoProcessor,
} from "@element-hq/matrixrtc-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { combineLatest } from "rxjs";

import { type MediaDevice } from "./MediaDevices";
import { type Handler } from "./MuteStates";

/** How a mute switch gets a track where there is none. */
export interface TrackSupply {
  publish: () => Promise<unknown>;
  /** Awaited before a switch turned on acts: a camera waits for its processor to be known. */
  ready?: () => Promise<unknown>;
}

/**
 * The mute switch drives the track, which reports back what the device
 * allowed, so a denied permission flips the switch back. A source is muted
 * and unmuted while its track exists and published when it does not.
 */
export function followMuteState(
  scope: ObservableScope,
  muteState: {
    setHandler: (handler: Handler) => void;
    unsetHandler: () => void;
    enabled$: Behavior<boolean>;
  },
  track$: Behavior<LocalMediaTrack | undefined>,
  supply: TrackSupply,
  source: "microphone" | "camera",
  logger: Logger,
): void {
  // What the switch asks for, ahead of what it shows: the switch follows
  // only once the handler has resolved
  let desired = muteState.enabled$.value;
  muteState.setHandler(async (enabled) => {
    desired = enabled;
    if (enabled) await supply.ready?.();
    const track = track$.value;
    if (track !== undefined) {
      desired = await track.setEnabled(enabled);
      return desired;
    }
    if (!enabled) return false;
    try {
      await supply.publish();
      return true;
    } catch (e) {
      logger.error(`Failed to publish the ${source}`, e);
      desired = false;
      return false;
    }
  });
  scope.onEnd(() => muteState.unsetHandler());
  // A track that arrives after its switch was flipped off catches up with it
  track$.pipe(scope.bind()).subscribe((track) => {
    if (track !== undefined && !desired)
      track.setEnabled(false).catch((e) => {
        logger.error(`Failed to mute the ${source}`, e);
      });
  });
}

/**
 * The device the user picked follows onto the track as it is made and as the
 * choice changes; the SDK does not watch the settings itself.
 */
export function followDevice(
  scope: ObservableScope,
  track$: Behavior<LocalMediaTrack | undefined>,
  device: MediaDevice<unknown, { id: string }>,
  source: "microphone" | "camera",
  logger: Logger,
): void {
  combineLatest([track$, device.selected$])
    .pipe(scope.bind())
    .subscribe(([track, selected]) => {
      if (track === undefined || selected === undefined) return;
      track.setDevice(selected.id).catch((e) => {
        logger.error(`Failed to switch the ${source} device`, e);
      });
    });
}

/**
 * Attached once the camera track exists rather than carried in the publish
 * request, so that a new track and a change of processor take the same path.
 */
export function followProcessor(
  scope: ObservableScope,
  camera$: Behavior<LocalVideoMediaTrack | undefined>,
  videoProcessor$: Behavior<VideoProcessor | undefined>,
  logger: Logger,
): void {
  combineLatest([camera$, videoProcessor$])
    .pipe(scope.bind())
    .subscribe(([camera, processor]) => {
      camera?.setProcessor(processor).catch((e) => {
        logger.error("Failed to set the video processor", e);
      });
    });
}
