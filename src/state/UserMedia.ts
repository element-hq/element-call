/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  combineLatest,
  map,
  type Observable,
  of,
  switchMap,
} from "rxjs";
import {
  type LocalParticipant,
  type Participant,
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
import type { RoomMember } from "matrix-js-sdk";
import type { EncryptionSystem } from "../e2ee/sharedKeyManagement.ts";
import type { MediaDevices } from "./MediaDevices.ts";
import type { ReactionOption } from "../reactions";
import { observeSpeaker$ } from "./observeSpeaker.ts";

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
 * for inclusion in the call layout.
 */
export class UserMedia {
  private readonly participant$ = new BehaviorSubject(this.initialParticipant);

  public readonly vm: UserMediaViewModel = this.participant$.value?.isLocal
    ? new LocalUserMediaViewModel(
        this.scope,
        this.id,
        this.member,
        this.participant$ as Behavior<LocalParticipant>,
        this.encryptionSystem,
        this.livekitRoom,
        this.focusURL,
        this.mediaDevices,
        this.scope.behavior(this.displayname$),
        this.scope.behavior(this.handRaised$),
        this.scope.behavior(this.reaction$),
      )
    : new RemoteUserMediaViewModel(
        this.scope,
        this.id,
        this.member,
        this.participant$ as Observable<RemoteParticipant | undefined>,
        this.encryptionSystem,
        this.livekitRoom,
        this.focusURL,
        this.pretendToBeDisconnected$,
        this.scope.behavior(this.displayname$),
        this.scope.behavior(this.handRaised$),
        this.scope.behavior(this.reaction$),
      );

  private readonly speaker$ = this.scope.behavior(
    observeSpeaker$(this.vm.speaking$),
  );

  private readonly presenter$ = this.scope.behavior(
    this.participant$.pipe(
      switchMap((p) => (p === undefined ? of(false) : sharingScreen$(p))),
    ),
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
    private readonly member: RoomMember,
    private readonly initialParticipant:
      | LocalParticipant
      | RemoteParticipant
      | undefined,
    private readonly encryptionSystem: EncryptionSystem,
    private readonly livekitRoom: LivekitRoom,
    private readonly focusURL: string,
    private readonly mediaDevices: MediaDevices,
    private readonly pretendToBeDisconnected$: Behavior<boolean>,
    private readonly displayname$: Observable<string>,
    private readonly handRaised$: Observable<Date | null>,
    private readonly reaction$: Observable<ReactionOption | null>,
  ) {}

  public updateParticipant(
    newParticipant: LocalParticipant | RemoteParticipant | undefined,
  ): void {
    if (this.participant$.value !== newParticipant) {
      // Update the BehaviourSubject in the UserMedia.
      this.participant$.next(newParticipant);
    }
  }
}

export function sharingScreen$(p: Participant): Observable<boolean> {
  return observeParticipantEvents(
    p,
    ParticipantEvent.TrackPublished,
    ParticipantEvent.TrackUnpublished,
    ParticipantEvent.LocalTrackPublished,
    ParticipantEvent.LocalTrackUnpublished,
  ).pipe(map((p) => p.isScreenShareEnabled));
}
