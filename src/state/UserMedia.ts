/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map, type Observable, of, switchMap } from "rxjs";
import {
  type LocalParticipant,
  ParticipantEvent,
  type RemoteParticipant,
  type Room as LivekitRoom,
} from "livekit-client";
import { observeParticipantEvents } from "@livekit/components-core";

import { type ObservableScope } from "./ObservableScope.ts";
import {
  LocalUserMediaViewModel,
  RemoteUserMediaViewModel,
  type UserMediaViewModel,
} from "./MediaViewModel.ts";
import type { Behavior } from "./Behavior.ts";
import type { EncryptionSystem } from "../e2ee/sharedKeyManagement.ts";
import type { MediaDevices } from "./MediaDevices.ts";
import type { ReactionOption } from "../reactions";
import { observeSpeaker$ } from "./observeSpeaker.ts";
import { generateItems } from "../utils/observable.ts";
import { ScreenShare } from "./ScreenShare.ts";
import { type TaggedParticipant } from "./CallViewModel/remoteMembers/MatrixLivekitMembers.ts";

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
 * UserMediaViewModel which additionally determines the media item's sorting bin
 * for inclusion in the call layout and tracks associated screen shares.
 */
export class UserMedia {
  public readonly vm: UserMediaViewModel =
    this.participant.type === "local"
      ? new LocalUserMediaViewModel(
          this.scope,
          this.id,
          this.userId,
          this.participant.value$,
          this.encryptionSystem,
          this.livekitRoom$,
          this.focusUrl$,
          this.mediaDevices,
          this.displayName$,
          this.mxcAvatarUrl$,
          this.scope.behavior(this.handRaised$),
          this.scope.behavior(this.reaction$),
        )
      : new RemoteUserMediaViewModel(
          this.scope,
          this.id,
          this.userId,
          this.participant.value$,
          this.encryptionSystem,
          this.livekitRoom$,
          this.focusUrl$,
          this.pretendToBeDisconnected$,
          this.displayName$,
          this.mxcAvatarUrl$,
          this.scope.behavior(this.handRaised$),
          this.scope.behavior(this.reaction$),
        );

  private readonly speaker$ = this.scope.behavior(
    observeSpeaker$(this.vm.speaking$),
  );

  // TypeScript needs this widening of the type to happen in a separate statement
  private readonly participant$: Behavior<
    LocalParticipant | RemoteParticipant | null
  > = this.participant.value$;

  /**
   * All screen share media associated with this user media.
   */
  public readonly screenShares$ = this.scope.behavior(
    this.participant$.pipe(
      switchMap((p) =>
        p === null
          ? of([])
          : observeParticipantEvents(
              p,
              ParticipantEvent.TrackPublished,
              ParticipantEvent.TrackUnpublished,
              ParticipantEvent.LocalTrackPublished,
              ParticipantEvent.LocalTrackUnpublished,
            ).pipe(
              // Technically more than one screen share might be possible... our
              // MediaViewModels don't support it though since they look for a unique
              // track for the given source. So generateItems here is a bit overkill.
              generateItems(
                function* (p) {
                  if (p.isScreenShareEnabled)
                    yield {
                      keys: ["screen-share"],
                      data: undefined,
                    };
                },
                (scope, _data$, key) =>
                  new ScreenShare(
                    scope,
                    `${this.id}:${key}`,
                    this.userId,
                    p,
                    this.encryptionSystem,
                    this.livekitRoom$,
                    this.focusUrl$,
                    this.pretendToBeDisconnected$,
                    this.displayName$,
                    this.mxcAvatarUrl$,
                  ),
              ),
            ),
      ),
    ),
  );

  private readonly presenter$ = this.scope.behavior(
    this.screenShares$.pipe(map((screenShares) => screenShares.length > 0)),
  );

  /**
   * Which sorting bin the media item should be placed in.
   */
  // This is exposed here rather than by UserMediaViewModel because it's only
  // relevant to the layout algorithms; the MediaView component should be
  // ignorant of this value.
  public readonly bin$ = combineLatest(
    [
      this.speaker$,
      this.presenter$,
      this.vm.videoEnabled$,
      this.vm.handRaised$,
      this.vm instanceof LocalUserMediaViewModel
        ? this.vm.alwaysShow$
        : of(false),
    ],
    (speaker, presenter, video, handRaised, alwaysShow) => {
      if (this.vm.local)
        return alwaysShow
          ? SortingBin.SelfAlwaysShown
          : SortingBin.SelfNotAlwaysShown;
      else if (presenter) return SortingBin.Presenters;
      else if (speaker) return SortingBin.Speakers;
      else if (handRaised) return SortingBin.HandRaised;
      else if (video) return SortingBin.Video;
      else return SortingBin.NoVideo;
    },
  );

  public constructor(
    private readonly scope: ObservableScope,
    public readonly id: string,
    private readonly userId: string,
    private readonly participant: TaggedParticipant,
    private readonly encryptionSystem: EncryptionSystem,
    private readonly livekitRoom$: Behavior<LivekitRoom | undefined>,
    private readonly focusUrl$: Behavior<string | undefined>,
    private readonly mediaDevices: MediaDevices,
    private readonly pretendToBeDisconnected$: Behavior<boolean>,
    private readonly displayName$: Behavior<string>,
    private readonly mxcAvatarUrl$: Behavior<string | undefined>,
    private readonly handRaised$: Observable<Date | null>,
    private readonly reaction$: Observable<ReactionOption | null>,
  ) {}
}
