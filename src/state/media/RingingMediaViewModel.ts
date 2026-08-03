/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RTCCallIntent } from "matrix-js-sdk/lib/matrixrtc";

import { type Behavior } from "../Behavior";
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
  intent: RTCCallIntent;
}

export interface RingingMediaInputs extends BaseMediaInputs {
  pickupState$: Behavior<"ringing" | "timeout" | "decline">;
  intent: RTCCallIntent;
}

export function createRingingMedia({
  pickupState$,
  intent,
  ...inputs
}: RingingMediaInputs): RingingMediaViewModel {
  return {
    ...createBaseMedia(inputs),
    type: "ringing",
    pickupState$,
    intent,
  };
}
