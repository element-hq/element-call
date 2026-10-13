/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Behavior,
  type MediaStreamStats,
  type MediaTrack,
  type ObservableScope,
} from "@element-hq/matrixrtc-sdk";
import {
  BehaviorSubject,
  combineLatest,
  map,
  of,
  Subject,
  switchMap,
} from "rxjs";

import { type ReactionOption } from "../../reactions";
import { type LocalUserMediaViewModel } from "./LocalUserMediaViewModel";
import {
  createMemberMedia,
  type MemberMediaInputs,
  memberTrack$,
  type BaseMemberMediaViewModel,
} from "./MemberMediaViewModel";
import { type RemoteUserMediaViewModel } from "./RemoteUserMediaViewModel";
import { showConnectionStats } from "../../settings/settings";

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
   * The expected identity of the member on the media backend. Exposed for debugging.
   */
  rtcBackendIdentity: string;
  handRaised$: Behavior<Date | null>;
  reaction$: Behavior<ReactionOption | null>;
  audioStreamStats$: Behavior<MediaStreamStats>;
  videoStreamStats$: Behavior<MediaStreamStats>;
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
}

export function createBaseUserMedia(
  scope: ObservableScope,
  {
    rtcBackendIdentity,
    handRaised$,
    reaction$,
    ...inputs
  }: BaseUserMediaInputs,
): BaseUserMediaViewModel {
  const { media$ } = inputs;
  const toggleCropVideo$ = new Subject<void>();
  const videoAspectRatio$ = new BehaviorSubject(NaN);
  const enabled$ = (
    scope: ObservableScope,
    source: "microphone" | "camera",
  ): Behavior<boolean> =>
    scope.behavior(
      memberTrack$<MediaTrack>(media$, source).pipe(
        switchMap((track) =>
          track === undefined
            ? of(false)
            : track.muted$.pipe(map((muted) => !muted)),
        ),
      ),
    );
  // The statistics are only polled while the setting asks for them
  const streamStats$ = (
    scope: ObservableScope,
    source: "microphone" | "camera",
  ): Behavior<MediaStreamStats> =>
    scope.behavior(
      combineLatest([
        memberTrack$<MediaTrack>(media$, source),
        showConnectionStats.value$,
      ]).pipe(
        switchMap(([track, show]) =>
          track !== undefined && show ? track.stats$ : of(undefined),
        ),
      ),
    );

  return {
    ...createMemberMedia(scope, {
      ...inputs,
      audioSource: "microphone",
      videoSource: "camera",
    }),
    type: "user",
    speaking$: scope.behavior(
      media$.pipe(
        switchMap((media) => (media === null ? of(false) : media.speaking$)),
      ),
    ),
    audioEnabled$: enabled$(scope, "microphone"),
    videoEnabled$: enabled$(scope, "camera"),
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
    audioStreamStats$: streamStats$(scope, "microphone"),
    videoStreamStats$: streamStats$(scope, "camera"),
    setVideoAspectRatio: (ratio) => videoAspectRatio$.next(ratio),
  };
}
