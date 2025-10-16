/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { of, type Observable } from "rxjs";
import {
  type LocalParticipant,
  type RemoteParticipant,
  type Room as LivekitRoom,
} from "livekit-client";

import { type ObservableScope } from "./ObservableScope.ts";
import { ScreenShareViewModel } from "./MediaViewModel.ts";
import type { RoomMember } from "matrix-js-sdk";
import type { EncryptionSystem } from "../e2ee/sharedKeyManagement.ts";
import type { Behavior } from "./Behavior.ts";

/**
 * A screen share media item to be presented in a tile. This is a thin wrapper
 * around ScreenShareViewModel which essentially just establishes an
 * ObservableScope for behaviors that the view model depends on.
 */
export class ScreenShare {
  public readonly vm: ScreenShareViewModel;

  public constructor(
    private readonly scope: ObservableScope,
    id: string,
    member: RoomMember,
    participant: LocalParticipant | RemoteParticipant,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    focusUrl: string,
    pretendToBeDisconnected$: Behavior<boolean>,
    displayName$: Observable<string>,
  ) {
    this.vm = new ScreenShareViewModel(
      this.scope,
      id,
      member,
      of(participant),
      encryptionSystem,
      livekitRoom,
      focusUrl,
      pretendToBeDisconnected$,
      this.scope.behavior(displayName$),
      participant.isLocal,
    );
  }
}
