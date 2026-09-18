/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { FfiElementCallCompat } from "../../matrix-rtc-sdk";

/**
 * The MatrixRTC slot Element Call lives in, `{application}#{id}` per
 * MSC4143. One per room: the application is a call and the id is the room's.
 */
export const ELEMENT_CALL_SLOT_ID = "m.call#ROOM";
export const ELEMENT_CALL_APPLICATION = "m.call";
/**
 * The state event type the crate opens a slot with (the unstable spelling
 * deployed homeservers know). Opening a slot needs the power level to send
 * it, which is what `RoomInfo.canOpenSlot` answers.
 */
export const ELEMENT_CALL_SLOT_EVENT_TYPE = "org.matrix.msc4143.rtc.slot";
/**
 * The crate's slot id for the pre-slot generation (MSC3401 state events,
 * `MatrixRTCMode.Compatibility`): that generation has no `m.rtc.slot`, so the
 * session is projected from the legacy state events alone and nobody opens
 * or checks a slot. The crate requires this id under `StateEvents` compat.
 */
export const LEGACY_SLOT_ID = "";

/** The slot a participation lives in for a given wire dialect. */
export function slotIdForCompat(compat: FfiElementCallCompat): string {
  return compat === FfiElementCallCompat.StateEvents
    ? LEGACY_SLOT_ID
    : ELEMENT_CALL_SLOT_ID;
}
