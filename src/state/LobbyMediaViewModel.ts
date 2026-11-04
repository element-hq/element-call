/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Behavior,
  type LocalAudioMediaTrack,
  type LocalMedia,
  type LocalVideoMediaTrack,
  type ObservableScope,
  type PublishRequest,
  trackBySource$,
  type VideoProcessor,
} from "@element-hq/matrixrtc-sdk";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { combineLatest, debounceTime, map } from "rxjs";

import {
  type CaptureSettings,
  publishRequest,
} from "./CallViewModel/CallViewModel";
import { type MediaDevices } from "./MediaDevices";
import { type MuteStates } from "./MuteStates";
import { followDevice, followProcessor } from "./localMediaControls";

export interface LobbyMediaViewModel {
  /** The camera, once open, for the preview. */
  videoTrack$: Behavior<LocalVideoMediaTrack | null>;
}

/**
 * The local media of the lobby: the devices the mute switches ask for, opened
 * ahead of the join on the media the join is then given, so that the call
 * publishes the very tracks the user previewed.
 */
export function createLobbyMediaViewModel(
  scope: ObservableScope,
  media: LocalMedia,
  muteStates: MuteStates,
  mediaDevices: MediaDevices,
  capture: CaptureSettings,
  videoProcessor$: Behavior<VideoProcessor | undefined>,
): LobbyMediaViewModel {
  const logger = rootLogger.getChild("[LobbyMedia]");
  const microphone$ = trackBySource$(
    scope,
    media.tracks$,
    "microphone",
  ) as Behavior<LocalAudioMediaTrack | undefined>;
  const camera$ = trackBySource$(scope, media.tracks$, "camera") as Behavior<
    LocalVideoMediaTrack | undefined
  >;

  // One could ask why this is not just done via followMuteStates.
  // The main purpose why this code exists is to handle the native browser permission
  // prompts properly.
  // no prompt if everything is muted, shared prompt if both are requested.
  const opening = new Set<PublishRequest["source"]>();
  combineLatest([
    muteStates.audio.enabled$,
    muteStates.video.enabled$,
    microphone$,
    camera$,
  ])
    .pipe(debounceTime(0), scope.bind())
    .subscribe(([audio, video, microphone, camera]) => {
      const open: PublishRequest[] = [];
      if (audio && microphone === undefined && !opening.has("microphone"))
        open.push(publishRequest("microphone", mediaDevices, capture));
      if (video && camera === undefined && !opening.has("camera"))
        open.push(
          publishRequest(
            "camera",
            mediaDevices,
            capture,
            videoProcessor$.value,
          ),
        );
      if (open.length > 0) {
        for (const { source } of open) opening.add(source);
        media
          .capture(open)
          .catch((e) => {
            logger.error("Failed to open the devices", e);
            // A device that cannot be opened leaves its switch off
            for (const { source } of open)
              (source === "microphone"
                ? muteStates.audio
                : muteStates.video
              ).setEnabled$.value?.(false);
          })
          .finally(() => {
            for (const { source } of open) opening.delete(source);
          });
      }
      // The camera is closed rather than muted, so that its light goes off
      if (!video && camera !== undefined) media.release("camera");
      if (microphone !== undefined && microphone.muted$.value === audio)
        microphone.setEnabled(audio).catch((e) => {
          logger.error("Failed to mute the microphone", e);
        });
    });

  followDevice(
    scope,
    microphone$,
    mediaDevices.audioInput,
    "microphone",
    logger,
  );
  followDevice(scope, camera$, mediaDevices.videoInput, "camera", logger);
  followProcessor(scope, camera$, videoProcessor$, logger);

  return {
    videoTrack$: scope.behavior(camera$.pipe(map((camera) => camera ?? null))),
  };
}
