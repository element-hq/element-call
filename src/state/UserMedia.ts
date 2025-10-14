/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject, map, type Observable, of, switchMap } from "rxjs";
import {
  type LocalParticipant,
  type Participant,
  ParticipantEvent,
  type RemoteParticipant,
  type Room as LivekitRoom,
} from "livekit-client";
import { observeParticipantEvents } from "@livekit/components-core";

import { ObservableScope } from "./ObservableScope.ts";
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
 * TODO Document this
 */
export class UserMedia {
  private readonly scope = new ObservableScope();
  public readonly vm: UserMediaViewModel;
  private readonly participant$: BehaviorSubject<
    LocalParticipant | RemoteParticipant | undefined
  >;

  public readonly speaker$: Behavior<boolean>;
  public readonly presenter$: Behavior<boolean>;

  public constructor(
    public readonly id: string,
    member: RoomMember,
    participant: LocalParticipant | RemoteParticipant | undefined,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    focusURL: string,
    mediaDevices: MediaDevices,
    pretendToBeDisconnected$: Behavior<boolean>,
    displayname$: Observable<string>,
    handRaised$: Observable<Date | null>,
    reaction$: Observable<ReactionOption | null>,
  ) {
    this.participant$ = new BehaviorSubject(participant);

    if (participant?.isLocal) {
      this.vm = new LocalUserMediaViewModel(
        this.id,
        member,
        this.participant$ as Behavior<LocalParticipant>,
        encryptionSystem,
        livekitRoom,
        focusURL,
        mediaDevices,
        this.scope.behavior(displayname$),
        this.scope.behavior(handRaised$),
        this.scope.behavior(reaction$),
      );
    } else {
      this.vm = new RemoteUserMediaViewModel(
        id,
        member,
        this.participant$.asObservable() as Observable<
          RemoteParticipant | undefined
        >,
        encryptionSystem,
        livekitRoom,
        focusURL,
        pretendToBeDisconnected$,
        this.scope.behavior(displayname$),
        this.scope.behavior(handRaised$),
        this.scope.behavior(reaction$),
      );
    }

    this.speaker$ = this.scope.behavior(observeSpeaker$(this.vm.speaking$));

    this.presenter$ = this.scope.behavior(
      this.participant$.pipe(
        switchMap((p) => (p === undefined ? of(false) : sharingScreen$(p))),
      ),
    );
  }

  public updateParticipant(
    newParticipant: LocalParticipant | RemoteParticipant | undefined,
  ): void {
    if (this.participant$.value !== newParticipant) {
      // Update the BehaviourSubject in the UserMedia.
      this.participant$.next(newParticipant);
    }
  }

  public destroy(): void {
    this.scope.end();
    this.vm.destroy();
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
