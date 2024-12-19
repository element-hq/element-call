/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  mockRtcMembership,
  mockMatrixRoomMember,
  mockRemoteParticipant,
  mockLocalParticipant,
} from "./test";

export const aliceRtcMember = mockRtcMembership("@alice:example.org", "AAAA");
export const alice = mockMatrixRoomMember(aliceRtcMember);
export const aliceId = `${alice.userId}:${aliceRtcMember.deviceId}`;
export const aliceParticipant = mockRemoteParticipant({ identity: aliceId });

export const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
export const local = mockMatrixRoomMember(localRtcMember);
export const localParticipant = mockLocalParticipant({ identity: "" });

export const bobRtcMember = mockRtcMembership("@bob:example.org", "BBBB");
