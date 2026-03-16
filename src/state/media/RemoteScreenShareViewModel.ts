/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Track, type RemoteParticipant } from "livekit-client";
import { map, of, switchMap } from "rxjs";

import { type Behavior } from "../Behavior";
import {
  type BaseScreenShareInputs,
  type BaseScreenShareViewModel,
  createBaseScreenShare,
} from "./ScreenShareViewModel";
import { type ObservableScope } from "../ObservableScope";
import { createVolumeControls, type VolumeControls } from "../VolumeControls";
import { observeTrackReference$ } from "../observeTrackReference";

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
  participant$: Behavior<RemoteParticipant | null>;
  pretendToBeDisconnected$: Behavior<boolean>;
}

export function createRemoteScreenShare(
  scope: ObservableScope,
  { pretendToBeDisconnected$, ...inputs }: RemoteScreenShareInputs,
): RemoteScreenShareViewModel {
  return {
    ...createBaseScreenShare(scope, inputs),
    ...createVolumeControls(scope, {
      pretendToBeDisconnected$,
      sink$: scope.behavior(
        inputs.participant$.pipe(
          map(
            (p) => (volume) =>
              p?.setVolume(volume, Track.Source.ScreenShareAudio),
          ),
        ),
      ),
    }),
    local: false,
    videoEnabled$: scope.behavior(
      pretendToBeDisconnected$.pipe(map((disconnected) => !disconnected)),
    ),
    audioEnabled$: scope.behavior(
      inputs.participant$.pipe(
        switchMap((p) =>
          p
            ? observeTrackReference$(p, Track.Source.ScreenShareAudio)
            : of(null),
        ),
        map(Boolean),
      ),
    ),
  };
}
