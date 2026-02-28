/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type RemoteAudioTrack,
  type RemoteParticipant,
  Track,
} from "livekit-client";
import { map } from "rxjs";

import { type Behavior } from "../Behavior";
import { createVolumeControls, type VolumeControls } from "../VolumeControls";
import {
  type BaseScreenShareInputs,
  type BaseScreenShareViewModel,
  createBaseScreenShare,
} from "./ScreenShareViewModel";
import { type ObservableScope } from "../ObservableScope";

export interface RemoteScreenShareViewModel
  extends BaseScreenShareViewModel,
    VolumeControls {
  local: false;
  /**
   * Whether this screen share's video should be displayed.
   */
  videoEnabled$: Behavior<boolean>;
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
          map((p) => (volume: number) => {
            const track = p?.getTrackPublication(
              Track.Source.ScreenShareAudio,
            )?.track as RemoteAudioTrack | undefined;
            track?.setVolume(volume);
          }),
        ),
      ),
    }),
    local: false,
    videoEnabled$: scope.behavior(
      pretendToBeDisconnected$.pipe(map((disconnected) => !disconnected)),
    ),
  };
}
