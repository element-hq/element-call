/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";
import { type LocalVideoTrack } from "livekit-client";

import { type Behavior } from "../state/Behavior";

/**
 * The camera track a background pipeline is synced to: the preview's before
 * joining, the call's after, none while the camera is off.
 */
export class SyncedCameraTrack {
  private readonly subject$ = new BehaviorSubject<LocalVideoTrack | null>(null);
  public readonly track$: Behavior<LocalVideoTrack | null> = this.subject$;

  public report(track: LocalVideoTrack): () => void {
    this.subject$.next(track);
    // Only if still this one, so a lobby leaving doesn't blank a call starting.
    return (): void => {
      if (this.subject$.value === track) this.subject$.next(null);
    };
  }
}
