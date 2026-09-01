/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RemoteParticipant } from "livekit-client";
import { combineLatest, map, of, switchMap } from "rxjs";

import { type Behavior } from "../Behavior";
import { createVolumeControls, type VolumeControls } from "../VolumeControls";
import {
  type BaseUserMediaInputs,
  type BaseUserMediaViewModel,
  createBaseUserMedia,
} from "./UserMediaViewModel";
import { type ObservableScope } from "../ObservableScope";

export interface RemoteUserMediaViewModel
  extends BaseUserMediaViewModel, VolumeControls {
  local: false;
  /**
   * Whether we are waiting for this user's LiveKit participant to exist. This
   * could be because either we or the remote party are still connecting.
   */
  waitingForMedia$: Behavior<boolean>;
}

export interface RemoteUserMediaInputs extends Omit<
  BaseUserMediaInputs,
  "statsType"
> {
  participant$: Behavior<RemoteParticipant | null>;
  pretendToBeDisconnected$: Behavior<boolean>;
  /**
   * Whether other participants' video feeds should be hidden (and thus not
   * downloaded, since LiveKit's adaptiveStream pauses tracks with no
   * attached video element) to save bandwidth.
   */
  disableRemoteVideo$: Behavior<boolean>;
}

export function createRemoteUserMedia(
  scope: ObservableScope,
  {
    pretendToBeDisconnected$,
    disableRemoteVideo$,
    ...inputs
  }: RemoteUserMediaInputs,
): RemoteUserMediaViewModel {
  const baseUserMedia = createBaseUserMedia(scope, {
    ...inputs,
    statsType: "inbound-rtp",
  });

  return {
    ...baseUserMedia,
    ...createVolumeControls(scope, {
      pretendToBeDisconnected$,
      sink$: scope.behavior(
        inputs.participant$.pipe(map((p) => (volume) => p?.setVolume(volume))),
      ),
    }),
    local: false,
    speaking$: scope.behavior(
      pretendToBeDisconnected$.pipe(
        switchMap((disconnected) =>
          disconnected ? of(false) : baseUserMedia.speaking$,
        ),
      ),
    ),
    videoEnabled$: scope.behavior(
      pretendToBeDisconnected$.pipe(
        switchMap((disconnected) =>
          disconnected ? of(false) : baseUserMedia.videoEnabled$,
        ),
      ),
    ),
    video$: scope.behavior(
      combineLatest([baseUserMedia.video$, disableRemoteVideo$]).pipe(
        map(([video, disabled]) => (disabled ? undefined : video)),
      ),
    ),
    waitingForMedia$: scope.behavior(
      combineLatest(
        [inputs.livekitRoom$, inputs.participant$],
        (livekitRoom, participant) =>
          // If livekitRoom is undefined, the user is not attempting to publish on
          // any transport and so we shouldn't expect a participant. (They might
          // be a subscribe-only bot for example.)
          livekitRoom !== undefined && participant === null,
      ),
    ),
  };
}
