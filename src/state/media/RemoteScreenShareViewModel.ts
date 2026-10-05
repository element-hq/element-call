/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Behavior,
  type ObservableScope,
  trackBySource$,
} from "@element-hq/matrixrtc-sdk";
import { map } from "rxjs";

import {
  type BaseScreenShareInputs,
  type BaseScreenShareViewModel,
  createBaseScreenShare,
} from "./ScreenShareViewModel";
import { createVolumeControls, type VolumeControls } from "../VolumeControls";

export interface RemoteScreenShareViewModel
  extends BaseScreenShareViewModel, VolumeControls {
  local: false;
  /**
   * Whether this screen share's video should be displayed.
   */
  videoEnabled$: Behavior<boolean>;
  /**
   * Whether this screen share should be considered to have an audio track.
   */
  audioEnabled$: Behavior<boolean>;
}

export interface RemoteScreenShareInputs extends BaseScreenShareInputs {
  pretendToBeDisconnected$: Behavior<boolean>;
}

export function createRemoteScreenShare(
  scope: ObservableScope,
  { pretendToBeDisconnected$, ...inputs }: RemoteScreenShareInputs,
): RemoteScreenShareViewModel {
  const audio$ = trackBySource$(
    scope,
    inputs.member.tracks$,
    "screenShareAudio",
  );
  return {
    ...createBaseScreenShare(scope, inputs),
    ...createVolumeControls(scope, {
      pretendToBeDisconnected$,
      sink$: scope.behavior(
        audio$.pipe(
          map((track) => (volume: number) => track?.setVolume(volume)),
        ),
      ),
    }),
    local: false,
    videoEnabled$: scope.behavior(
      pretendToBeDisconnected$.pipe(map((disconnected) => !disconnected)),
    ),
    audioEnabled$: scope.behavior(
      audio$.pipe(map((track) => track !== undefined)),
    ),
  };
}
