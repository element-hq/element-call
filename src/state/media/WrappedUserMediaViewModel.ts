/*
Copyright 2025-2026 Element Software Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Behavior,
  generateItems,
  type LocalMemberMedia,
  type MemberMedia,
  type ObservableScope,
} from "@element-hq/matrixrtc-sdk";
import { combineLatest, map, of, switchMap } from "rxjs";

import { observeSpeaker$ } from "./observeSpeaker.ts";
import { type UserMediaViewModel } from "./UserMediaViewModel.ts";
import { type ScreenShareViewModel } from "./ScreenShareViewModel.ts";
import {
  createLocalUserMedia,
  type LocalUserMediaInputs,
} from "./LocalUserMediaViewModel.ts";
import {
  createRemoteUserMedia,
  type RemoteUserMediaInputs,
} from "./RemoteUserMediaViewModel.ts";
import { createLocalScreenShare } from "./LocalScreenShareViewModel.ts";
import { createRemoteScreenShare } from "./RemoteScreenShareViewModel.ts";

/**
 * Sorting bins defining the order in which media tiles appear in the layout.
 */
enum SortingBin {
  /**
   * Yourself, when the "always show self" option is on.
   */
  SelfAlwaysShown,
  /**
   * Participants that are sharing their screen.
   */
  Presenters,
  /**
   * Participants that have been speaking recently.
   */
  Speakers,
  /**
   * Participants that have their hand raised.
   */
  HandRaised,
  /**
   * Participants with video.
   */
  Video,
  /**
   * Participants not sharing any video.
   */
  NoVideo,
  /**
   * Yourself, when the "always show self" option is off.
   */
  SelfNotAlwaysShown,
}

/**
 * A user media item to be presented in a tile. This is a thin wrapper around
 * UserMediaViewModel which additionally carries data relevant to the tile
 * layout algorithms (data which the MediaView component should be ignorant of).
 */
export type WrappedUserMediaViewModel = UserMediaViewModel & {
  /**
   * All screen share media associated with this user media.
   */
  screenShares$: Behavior<ScreenShareViewModel[]>;
  /**
   * Which sorting bin the media item should be placed in.
   */
  bin$: Behavior<SortingBin>;
};

type WrappedUserMediaInputs = Omit<
  LocalUserMediaInputs & RemoteUserMediaInputs,
  "media$"
> &
  (
    | { local: true; media$: Behavior<LocalMemberMedia | null> }
    | { local: false; media$: Behavior<MemberMedia | null> }
  );

export function createWrappedUserMedia(
  scope: ObservableScope,
  { mediaDevices, pretendToBeDisconnected$, ...rest }: WrappedUserMediaInputs,
): WrappedUserMediaViewModel {
  const { local, media$: _media$, ...inputs } = rest;
  const userMedia = rest.local
    ? createLocalUserMedia(scope, {
        media$: rest.media$,
        mediaDevices,
        ...inputs,
      })
    : createRemoteUserMedia(scope, {
        media$: rest.media$,
        pretendToBeDisconnected$,
        ...inputs,
      });
  // TypeScript needs this widening of the type to happen in a separate statement
  const media$: Behavior<MemberMedia | null> = _media$;

  const screenShares$ = scope.behavior(
    media$.pipe(
      switchMap((media) =>
        media === null ? of(false) : media.screenShareEnabled$,
      ),
      // Technically more than one screen share might be possible... our
      // MediaViewModels don't support it though since they look for a unique
      // track for the given source. So generateItems here is a bit overkill.
      generateItems(
        `${inputs.id} screenShares$`,
        function* (enabled) {
          if (enabled) yield { keys: ["screen-share"], data: undefined };
        },
        (scope, _data$, key) => {
          const id = `${inputs.id}:${key}`;
          return local
            ? createLocalScreenShare(scope, { ...inputs, id, media$ })
            : createRemoteScreenShare(scope, {
                ...inputs,
                id,
                media$,
                pretendToBeDisconnected$,
              });
        },
      ),
    ),
  );

  const speaker$ = scope.behavior(observeSpeaker$(userMedia.speaking$));
  const presenter$ = scope.behavior(
    screenShares$.pipe(map((screenShares) => screenShares.length > 0)),
  );

  return {
    ...userMedia,
    screenShares$,
    bin$: scope.behavior(
      combineLatest(
        [
          speaker$,
          presenter$,
          userMedia.videoEnabled$,
          userMedia.handRaised$,
          userMedia.local ? userMedia.alwaysShow$ : of<boolean | null>(null),
        ],
        (speaker, presenter, video, handRaised, alwaysShow) => {
          if (alwaysShow !== null)
            return alwaysShow
              ? SortingBin.SelfAlwaysShown
              : SortingBin.SelfNotAlwaysShown;
          else if (presenter) return SortingBin.Presenters;
          else if (speaker) return SortingBin.Speakers;
          else if (handRaised) return SortingBin.HandRaised;
          else if (video) return SortingBin.Video;
          else return SortingBin.NoVideo;
        },
      ),
    ),
  };
}
