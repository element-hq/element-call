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
import { combineLatest, map, of, switchMap } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { createVolumeControls, type VolumeControls } from "../VolumeControls";
import {
  type BaseUserMediaInputs,
  type BaseUserMediaViewModel,
  createBaseUserMedia,
} from "./UserMediaViewModel";

export interface RemoteUserMediaViewModel
  extends BaseUserMediaViewModel, VolumeControls {
  local: false;
  /**
   * Whether we are waiting for this user's media to arrive. This could be
   * because either we or the remote party are still connecting.
   */
  waitingForMedia$: Behavior<boolean>;
}

export interface RemoteUserMediaInputs extends BaseUserMediaInputs {
  pretendToBeDisconnected$: Behavior<boolean>;
}

export function createRemoteUserMedia(
  scope: ObservableScope,
  { pretendToBeDisconnected$, ...inputs }: RemoteUserMediaInputs,
): RemoteUserMediaViewModel {
  const baseUserMedia = createBaseUserMedia(scope, inputs);

  const waitingForMedia$ = scope.behavior(
    combineLatest(
      [inputs.focusUrl$, inputs.member.tracks$],
      // Without a transport the user is not attempting to publish anywhere
      // and so we shouldn't expect media. (They might be a subscribe-only bot
      // for example.)
      (focusUrl, tracks) => focusUrl !== undefined && tracks === null,
    ),
  );
  waitingForMedia$.pipe(scope.bind()).subscribe((waiting) => {
    logger.info(`[RemoteUserMedia ${inputs.id}] waitingForMedia=${waiting}`);
  });

  return {
    ...baseUserMedia,
    ...createVolumeControls(scope, {
      pretendToBeDisconnected$,
      sink$: scope.behavior(
        trackBySource$(scope, inputs.member.tracks$, "microphone").pipe(
          map((track) => (volume: number) => track?.setVolume(volume)),
        ),
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
    waitingForMedia$,
  };
}
