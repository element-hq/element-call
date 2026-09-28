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
  type BaseMemberMediaViewModel,
} from "./MemberMediaViewModel";
import { type RemoteUserMediaViewModel } from "./RemoteUserMediaViewModel";
import { type ObservableScope } from "../ObservableScope";
import { showConnectionStats } from "../../settings/settings";
import { observeRtpStreamStats$ } from "./observeRtpStreamStats";

/**
 * A participant's user media (i.e. their microphone and camera feed).
 */
export type UserMediaViewModel =
  | LocalUserMediaViewModel
  | RemoteUserMediaViewModel;

export interface BaseUserMediaViewModel extends BaseMemberMediaViewModel {
  type: "user";
  speaking$: Behavior<boolean>;
  audioEnabled$: Behavior<boolean>;
  videoEnabled$: Behavior<boolean>;
  videoOrientation$: Behavior<"landscape" | "portrait">;
  toggleCropVideo: () => void;
  /**
   * The expected identity of the LiveKit participant. Exposed for debugging.
   */
  rtcBackendIdentity: string;
  handRaised$: Behavior<Date | null>;
  reaction$: Behavior<ReactionOption | null>;
  audioStreamStats$: Behavior<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
  videoStreamStats$: Behavior<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
  /**
   * Set the aspect ratio of the video track to determine the orientation.
   */
  setVideoAspectRatio: (ratio: number) => void;
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
  const videoAspectRatio$ = new BehaviorSubject(NaN);
  const streamStats$ = (
    scope: ObservableScope,
    source: Track.Source,
  ): Behavior<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  > =>
    scope.behavior(
      combineLatest([participant$, showConnectionStats.value$]).pipe(
        switchMap(([p, showConnectionStats]) =>
          p && showConnectionStats
            ? observeRtpStreamStats$(p, source, statsType)
            : of(undefined),
        ),
      ),
    );

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
    videoOrientation$: scope.behavior(
      videoAspectRatio$.pipe(
        map((aspect) => (aspect > 1 ? "landscape" : "portrait")),
      ),
      "portrait",
    ),
    toggleCropVideo: () => toggleCropVideo$.next(),
    rtcBackendIdentity,
    handRaised$,
    reaction$,
    audioStreamStats$: streamStats$(scope, Track.Source.Microphone),
    videoStreamStats$: streamStats$(scope, Track.Source.Camera),
    setVideoAspectRatio: (ratio) => videoAspectRatio$.next(ratio),
  };
}
