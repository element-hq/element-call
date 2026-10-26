/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ObservableScope } from "@element-hq/matrixrtc-sdk";

import { type LocalScreenShareViewModel } from "./LocalScreenShareViewModel";
import {
  createMemberMedia,
  type MemberMediaInputs,
  type BaseMemberMediaViewModel,
} from "./MemberMediaViewModel";
import { type RemoteScreenShareViewModel } from "./RemoteScreenShareViewModel";

/**
 * A participant's screen share media.
 */
export type ScreenShareViewModel =
  | LocalScreenShareViewModel
  | RemoteScreenShareViewModel;

/**
 * Properties which are common to all ScreenShareViewModels.
 */
export interface BaseScreenShareViewModel extends BaseMemberMediaViewModel {
  type: "screen share";
}

export type BaseScreenShareInputs = Omit<
  MemberMediaInputs,
  "audioSource" | "videoSource"
>;

export function createBaseScreenShare(
  scope: ObservableScope,
  inputs: BaseScreenShareInputs,
): BaseScreenShareViewModel {
  return {
    ...createMemberMedia(scope, {
      ...inputs,
      audioSource: "screenShareAudio",
      videoSource: "screenShare",
    }),
    type: "screen share",
  };
}
