/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  combineLatest,
  map,
  type Observable,
  of,
  Subject,
  switchMap,
} from "rxjs";
import {
  observeParticipantEvents,
  observeParticipantMedia,
} from "@livekit/components-core";
import { ParticipantEvent, Track } from "livekit-client";

import { type ReactionOption } from "../../reactions";
import { type Behavior } from "../Behavior";
import { type LocalUserMediaViewModel } from "./LocalUserMediaViewModel";
import {
  createMemberMedia,
  type MemberMediaInputs,
  type MemberMediaViewModel,
} from "./MemberMediaViewModel";
import { type RemoteUserMediaViewModel } from "./RemoteUserMediaViewModel";
import { type ObservableScope } from "../ObservableScope";
import { showConnectionStats } from "../../settings/settings";
import { observeRtpStreamStats$ } from "./observeRtpStreamStats";
import { videoFit$, videoSizeFromParticipant$ } from "../../utils/videoFit.ts";

/**
 * A participant's user media (i.e. their microphone and camera feed).
 */
export type UserMediaViewModel =
  | LocalUserMediaViewModel
  | RemoteUserMediaViewModel;

export interface BaseUserMediaViewModel extends MemberMediaViewModel {
  type: "user";
  speaking$: Behavior<boolean>;
  audioEnabled$: Behavior<boolean>;
  videoEnabled$: Behavior<boolean>;
  videoFit$: Behavior<"cover" | "contain">;
  toggleCropVideo: () => void;
  /**
   * The expected identity of the LiveKit participant. Exposed for debugging.
   */
  rtcBackendIdentity: string;
  handRaised$: Behavior<Date | null>;
  reaction$: Behavior<ReactionOption | null>;
  audioStreamStats$: Observable<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
  videoStreamStats$: Observable<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
  /**
   * Set the actual dimensions of the HTML element.
   * This can be used to determine the best video fit (fit to frame / keep ratio).
   * @param width - The actual width of the HTML element displaying the video.
   * @param height - The actual height of the HTML element displaying the video.
   */
  setActualDimensions: (width: number, height: number) => void;
}

export interface BaseUserMediaInputs extends Omit<
  MemberMediaInputs,
  "audioSource" | "videoSource"
> {
  rtcBackendIdentity: string;
  handRaised$: Behavior<Date | null>;
  reaction$: Behavior<ReactionOption | null>;
  statsType: "inbound-rtp" | "outbound-rtp";
}

export function createBaseUserMedia(
  scope: ObservableScope,
  {
    rtcBackendIdentity,
    handRaised$,
    reaction$,
    statsType,
    ...inputs
  }: BaseUserMediaInputs,
): BaseUserMediaViewModel {
  const { participant$ } = inputs;
  const media$ = scope.behavior(
    participant$.pipe(
      switchMap((p) => (p && observeParticipantMedia(p)) ?? of(undefined)),
    ),
  );
  const toggleCropVideo$ = new Subject<void>();

  const actualSize$ = new BehaviorSubject<
    { width: number; height: number } | undefined
  >(undefined);

  return {
    ...createMemberMedia(scope, {
      ...inputs,
      audioSource: Track.Source.Microphone,
      videoSource: Track.Source.Camera,
    }),
    type: "user",
    speaking$: scope.behavior(
      participant$.pipe(
        switchMap((p) =>
          p
            ? observeParticipantEvents(
                p,
                ParticipantEvent.IsSpeakingChanged,
              ).pipe(map((p) => p.isSpeaking))
            : of(false),
        ),
      ),
    ),
    audioEnabled$: scope.behavior(
      media$.pipe(map((m) => m?.microphoneTrack?.isMuted === false)),
    ),
    videoEnabled$: scope.behavior(
      media$.pipe(map((m) => m?.cameraTrack?.isMuted === false)),
    ),
    videoFit$: videoFit$(
      scope,
      videoSizeFromParticipant$(participant$),
      actualSize$,
    ),
    toggleCropVideo: () => toggleCropVideo$.next(),
    rtcBackendIdentity,
    handRaised$,
    reaction$,
    audioStreamStats$: combineLatest([
      participant$,
      showConnectionStats.value$,
    ]).pipe(
      switchMap(([p, showConnectionStats]) => {
        //
        if (!p || !showConnectionStats) return of(undefined);
        return observeRtpStreamStats$(p, Track.Source.Microphone, statsType);
      }),
    ),
    videoStreamStats$: combineLatest([
      participant$,
      showConnectionStats.value$,
    ]).pipe(
      switchMap(([p, showConnectionStats]) => {
        if (!p || !showConnectionStats) return of(undefined);
        return observeRtpStreamStats$(p, Track.Source.Camera, statsType);
      }),
    ),
    setActualDimensions: (width: number, height: number): void => {
      actualSize$.next({ width, height });
    },
  };
}
