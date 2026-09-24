/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";
import { type LocalVideoMediaTrack } from "@element-hq/matrixrtc-sdk";

import { type Behavior } from "../state/Behavior";

/**
 * A camera that can be shown in a video element: the MatrixRTC SDK's track,
 * before joining and in the call alike.
 */
export interface ShownCamera {
  attach(element: HTMLVideoElement): void;
  /** Detaches this element only: another may be showing the same camera. */
  detach(element: HTMLVideoElement): void;
  /** Whether it faces the user, so that it is shown mirrored. */
  facesUser(): boolean;
}

// One per track, so that a view showing it isn't attached again on every render.
const shown = new WeakMap<object, ShownCamera>();

function shownOnce(track: object, make: () => ShownCamera): ShownCamera {
  let camera = shown.get(track);
  if (camera === undefined) {
    camera = make();
    shown.set(track, camera);
  }
  return camera;
}

/** A camera as the MatrixRTC SDK has it. */
export function sdkCamera(track: LocalVideoMediaTrack): ShownCamera {
  return shownOnce(track, () => ({
    attach: (element): void => track.attach(element),
    detach: (element): void => track.detach(element),
    facesUser: (): boolean => track.facingMode$.value === "user",
  }));
}

/**
 * The camera track a background pipeline is synced to: the lobby's before
 * joining, the call's after, none while the camera is off.
 */
export class SyncedCameraTrack {
  private readonly subject$ = new BehaviorSubject<ShownCamera | null>(null);
  public readonly track$: Behavior<ShownCamera | null> = this.subject$;

  public report(track: ShownCamera): () => void {
    this.subject$.next(track);
    // Only if still this one, so a lobby leaving doesn't blank a call starting.
    return (): void => {
      if (this.subject$.value === track) this.subject$.next(null);
    };
  }
}
