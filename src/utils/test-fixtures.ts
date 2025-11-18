/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  mockRtcMembership,
  mockMatrixRoomMember,
  mockRemoteParticipant,
} from "./test";

export const localRtcMember = mockRtcMembership("@local:example.org", "1111");
export const localRtcMemberDevice2 = mockRtcMembership(
  "@local:example.org",
  "2222",
);
export const local = mockMatrixRoomMember(localRtcMember);
// export const localParticipant = mockLocalParticipant({ identity: "" });
export const localId = `${local.userId}:${localRtcMember.deviceId}`;

export const aliceRtcMember = mockRtcMembership("@alice:example.org", "AAAA");
export const alice = mockMatrixRoomMember(aliceRtcMember, {
  rawDisplayName: "Alice",
});
export const aliceId = `${alice.userId}:${aliceRtcMember.deviceId}`;
export const aliceParticipant = mockRemoteParticipant({ identity: aliceId });

export const aliceDoppelgangerRtcMember = mockRtcMembership(
  "@alice2:example.org",
  "AAAA",
);
export const aliceDoppelganger = mockMatrixRoomMember(
  aliceDoppelgangerRtcMember,
  {
    rawDisplayName: "Alice",
  },
);

export const bobRtcMember = mockRtcMembership("@bob:example.org", "BBBB");
export const bob = mockMatrixRoomMember(bobRtcMember, {
  rawDisplayName: "Bob",
});
export const bobId = `${bob.userId}:${bobRtcMember.deviceId}`;

export const bobZeroWidthSpaceRtcMember = mockRtcMembership(
  "@bob2:example.org",
  "BBBB",
);
export const bobZeroWidthSpace = mockMatrixRoomMember(
  bobZeroWidthSpaceRtcMember,
  {
    rawDisplayName: "Bo\u200bb",
  },
);

export const daveRTLRtcMember = mockRtcMembership("@dave2:example.org", "DDDD");
export const daveRTL = mockMatrixRoomMember(daveRTLRtcMember, {
  rawDisplayName: "\u202eevaD",
});
