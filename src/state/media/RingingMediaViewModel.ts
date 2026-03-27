/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Behavior } from "../Behavior";
import { type MuteStates } from "../MuteStates";
import {
  type BaseMediaInputs,
  type BaseMediaViewModel,
  createBaseMedia,
} from "./MediaViewModel";

/**
 * Media representing a user who is not yet part of the call — one that we are
 * *ringing*.
 */
export interface RingingMediaViewModel extends BaseMediaViewModel {
  type: "ringing";
  pickupState$: Behavior<"ringing" | "timeout" | "decline">;
  /**
   * Whether this media would be expected to have video, were it not simply a
   * placeholder.
   */
  videoEnabled$: Behavior<boolean>;
}

export interface RingingMediaInputs extends BaseMediaInputs {
  pickupState$: Behavior<"ringing" | "timeout" | "decline">;
  /**
   * The local user's own mute states.
   */
  muteStates: MuteStates;
}

export function createRingingMedia({
  pickupState$,
  muteStates,
  ...inputs
}: RingingMediaInputs): RingingMediaViewModel {
  return {
    ...createBaseMedia(inputs),
    type: "ringing",
    pickupState$,
    // If our own video is enabled, then this is a video call and we would
    // expect remote media to have video as well
    videoEnabled$: muteStates.video.enabled$,
  };
}
