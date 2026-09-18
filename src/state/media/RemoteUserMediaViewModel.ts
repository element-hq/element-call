/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RemoteParticipant, Track, TrackEvent } from "livekit-client";
import { observeParticipantMedia } from "@livekit/components-core";
import {
  combineLatest,
  distinctUntilChanged,
  fromEvent,
  map,
  NEVER,
  of,
  startWith,
  switchMap,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

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
}

export function createRemoteUserMedia(
  scope: ObservableScope,
  { pretendToBeDisconnected$, ...inputs }: RemoteUserMediaInputs,
): RemoteUserMediaViewModel {
  const baseUserMedia = createBaseUserMedia(scope, {
    ...inputs,
    statsType: "inbound-rtp",
  });

  const waitingForMedia$ = scope.behavior(
    combineLatest(
      [inputs.livekitRoom$, inputs.participant$],
      (livekitRoom, participant) =>
        // If livekitRoom is undefined, the user is not attempting to publish on
        // any transport and so we shouldn't expect a participant. (They might
        // be a subscribe-only bot for example.)
        livekitRoom !== undefined && participant === null,
    ),
  );
  waitingForMedia$.pipe(scope.bind()).subscribe((waiting) => {
    logger.info(`[RemoteUserMedia ${inputs.id}] waitingForMedia=${waiting}`);
  });

  // Emits whenever an audio element is attached to this participant's
  // microphone track: a new subscription after they rejoin or reconnect, or
  // their first unmute if they joined muted (EC only publishes the track
  // then). The requested volume has to be applied again at that point.
  // livekit-client stores the volume on the RemoteAudioTrack and re-applies
  // it on attach, except that a stored volume of 0 is dropped by a truthiness
  // check (RemoteAudioTrack.attach: `if (this.elementVolume)`), so "mute for
  // me" would otherwise be lost as soon as a new track arrives.
  const audioElementAttached$ = inputs.participant$.pipe(
    switchMap((p) =>
      p === null
        ? NEVER
        : observeParticipantMedia(p).pipe(
            map(() => p.getTrackPublication(Track.Source.Microphone)?.track),
            distinctUntilChanged(),
            switchMap((track) =>
              track === undefined
                ? NEVER
                : fromEvent(track, TrackEvent.ElementAttached),
            ),
          ),
    ),
  );

  const volumeControls = createVolumeControls(scope, {
    pretendToBeDisconnected$,
    sink$: scope.behavior(
      combineLatest([
        inputs.participant$,
        audioElementAttached$.pipe(startWith(null)),
      ]).pipe(
        map(([p, attached]) => (volume) => {
          if (attached !== null)
            logger.info(
              `[RemoteUserMedia ${inputs.id}] re-applying playback volume ${volume} after audio element attach`,
            );
          p?.setVolume(volume);
        }),
      ),
    ),
  });
  volumeControls.playbackMuted$.pipe(scope.bind()).subscribe((muted) => {
    logger.info(`[RemoteUserMedia ${inputs.id}] playbackMuted=${muted}`);
  });

  return {
    ...baseUserMedia,
    ...volumeControls,
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
