/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Behavior } from "../Behavior";
import { type RingingMediaViewModel } from "./RingingMediaViewModel";
import { type ScreenShareViewModel } from "./ScreenShareViewModel";
import { type UserMediaViewModel } from "./UserMediaViewModel";

/**
 * A participant's media.
 */
export type MediaViewModel =
  | UserMediaViewModel
  | ScreenShareViewModel
  | RingingMediaViewModel;

/**
 * Properties which are common to all MediaViewModels.
 */
export interface BaseMediaViewModel {
  /**
   * An opaque identifier for this media.
   */
  id: string;
  /**
   * The Matrix user to which this media belongs.
   */
  userId: string;
  displayName$: Behavior<string>;
  mxcAvatarUrl$: Behavior<string | undefined>;
}

export type BaseMediaInputs = BaseMediaViewModel;

// All this function does is strip out superfluous data from the input object
export function createBaseMedia({
  id,
  userId,
  displayName$,
  mxcAvatarUrl$,
}: BaseMediaInputs): BaseMediaViewModel {
  return { id, userId, displayName$, mxcAvatarUrl$ };
}
