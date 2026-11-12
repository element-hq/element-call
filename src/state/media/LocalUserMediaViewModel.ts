/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Behavior,
  type LocalRTCMember,
  type LocalVideoMediaTrack,
  type ObservableScope,
  trackBySource$,
} from "@element-hq/matrixrtc-sdk";
import { map, of, switchMap } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  type BaseUserMediaInputs,
  type BaseUserMediaViewModel,
  createBaseUserMedia,
} from "./UserMediaViewModel";
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
  "member"
> {
  member: Pick<LocalRTCMember, "local" | "tracks$" | "encryptionError$">;
  mediaDevices: MediaDevices;
}

export function createLocalUserMedia(
  scope: ObservableScope,
  { mediaDevices, ...inputs }: LocalUserMediaInputs,
): LocalUserMediaViewModel {
  const baseUserMedia = createBaseUserMedia(scope, inputs);
  // Our own camera track, which carries the controls a remote one lacks
  const camera$ = trackBySource$(
    scope,
    inputs.member.tracks$,
    "camera",
  ) as Behavior<LocalVideoMediaTrack | undefined>;
  const facingMode$ = scope.behavior(
    camera$.pipe(switchMap((camera) => camera?.facingMode$ ?? of(undefined))),
  );

  return {
    ...baseUserMedia,
    local: true,
    // Mirror only front-facing cameras (those that face the user)
    mirror$: scope.behavior(
      facingMode$.pipe(map((facingMode) => facingMode === "user")),
    ),
    alwaysShow$: alwaysShowSelf.value$,
    setAlwaysShow: alwaysShowSelf.setValue,
    switchCamera$: scope.behavior(
      platform === "desktop"
        ? of(null)
        : facingMode$.pipe(
            // If the camera isn't front or back-facing, don't provide a switch
            // camera shortcut at all
            map((facingMode) =>
              facingMode === undefined
                ? null
                : (): void =>
                    void camera$.value
                      ?.switchFacingMode()
                      .then((deviceId) => {
                        // Inform the MediaDevices which camera was chosen
                        if (deviceId !== undefined)
                          mediaDevices.videoInput.select(deviceId);
                      })
                      .catch((e) =>
                        logger.error("Failed to switch camera", facingMode, e),
                      ),
            ),
          ),
    ),
  };
}
