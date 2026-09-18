/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FfiMember } from "../../matrix-rtc-sdk";

/**
 * The id the call view keys a member's tiles, hands and reactions by:
 * `${userId}:${deviceId}`, as it has always been. The crate does not always
 * know a member's device (an unencrypted room, a pre-sticky event); the
 * member id stands in then, which keeps the id unique.
 */
export function memberMediaId(member: FfiMember): string {
  return `${member.userId}:${member.deviceId ?? member.memberId}`;
}
