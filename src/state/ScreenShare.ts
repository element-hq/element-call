/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { ObservableScope } from "./ObservableScope.ts";
import { ScreenShareViewModel } from "./MediaViewModel.ts";
import { BehaviorSubject, type Observable } from "rxjs";
import {
  LocalParticipant,
  RemoteParticipant,
  type Room as LivekitRoom,
} from "livekit-client";
import type { RoomMember } from "matrix-js-sdk";
import type { EncryptionSystem } from "../e2ee/sharedKeyManagement.ts";
import type { Behavior } from "./Behavior.ts";

// TODO Document this
export class ScreenShare {
  private readonly scope = new ObservableScope();
  public readonly vm: ScreenShareViewModel;
  private readonly participant$: BehaviorSubject<
    LocalParticipant | RemoteParticipant
  >;

  public constructor(
    id: string,
    member: RoomMember,
    participant: LocalParticipant | RemoteParticipant,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    pretendToBeDisconnected$: Behavior<boolean>,
    displayName$: Observable<string>,
  ) {
    this.participant$ = new BehaviorSubject(participant);

    this.vm = new ScreenShareViewModel(
      id,
      member,
      this.participant$.asObservable(),
      encryptionSystem,
      livekitRoom,
      pretendToBeDisconnected$,
      this.scope.behavior(displayName$),
      participant.isLocal,
    );
  }

  public destroy(): void {
    this.scope.end();
    this.vm.destroy();
  }
}
