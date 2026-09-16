/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  MockConnection,
  mockLivekitRoom,
  mockLocalParticipant,
  mockRemoteParticipant,
  testScope,
} from "../../../utils/test";
import {
  FakeParticipation,
  fakeMembership,
} from "../../../utils/test-participation";
import { constant } from "../../Behavior";
import { Epoch } from "../../ObservableScope";
import { ConnectionManagerData } from "./ConnectionManager";
import {
  callMemberOf,
  createParticipationRemoteMembers$,
} from "./ParticipationMembers";

const LK = "https://lk.example.org";

describe("callMemberOf", () => {
  it("projects the crate's membership onto what a tile needs", () => {
    expect(
      callMemberOf(
        fakeMembership({
          member: { memberId: "m-1", userId: "@a:x", deviceId: "DEV" },
          transportIdentity: "lk-1",
        }),
      ),
    ).toEqual({
      userId: "@a:x",
      deviceId: "DEV",
      memberId: "m-1",
      rtcBackendIdentity: "lk-1",
    });
    // No device known: the member id keeps the media id unique.
    expect(
      callMemberOf(
        fakeMembership({ member: { memberId: "m-2", deviceId: undefined } }),
      ).deviceId,
    ).toBe("m-2");
  });
});

describe("createParticipationRemoteMembers$", () => {
  it("lists everyone but us, with their connection and participant", () => {
    const scope = testScope();
    const participation = new FakeParticipation();
    participation.ownMemberId$.next("m-me");

    const connection = new MockConnection(
      {
        scope,
        transport: { type: "livekit", livekit_service_url: LK },
        ownMembershipIdentity: {
          userId: "@me:x",
          deviceId: "MYDEV",
          memberId: "m-me",
        },
        client: null,
        roomId: "!room:x",
        livekitRoomFactory: () =>
          mockLivekitRoom({
            localParticipant: mockLocalParticipant({ identity: "lk-me" }),
            remoteParticipants: new Map(),
          }),
      },
      logger,
    );
    const peerParticipant = mockRemoteParticipant({ identity: "lk-peer" });
    const data = new ConnectionManagerData();
    data.add(connection, [peerParticipant]);

    const members$ = createParticipationRemoteMembers$({
      scope,
      participation,
      connectionManager: {
        connectionManagerData$: constant(new Epoch(data, 1)),
      },
    });
    expect(members$.value.value).toEqual([]);

    participation.setMemberships([
      fakeMembership({ member: { memberId: "m-me", userId: "@me:x" } }),
      fakeMembership({
        member: { memberId: "m-peer", userId: "@peer:x" },
        connections: [LK],
        transportIdentity: "lk-peer",
      }),
      // Not on LiveKit yet (no token minted for them): no participant.
      fakeMembership({
        member: { memberId: "m-late", userId: "@late:x" },
        connections: ["https://elsewhere.example.org"],
        transportIdentity: "lk-late",
      }),
    ]);

    const members = members$.value.value;
    expect(members.map((m) => m.membership$.value.memberId)).toEqual([
      "m-peer",
      "m-late",
    ]);
    const [peer, late] = members;
    expect(peer.userId).toBe("@peer:x");
    expect(peer.connection$.value).toBe(connection);
    expect(peer.participant.value$.value).toBe(peerParticipant);
    expect(late.connection$.value).toBeNull();
    expect(late.participant.value$.value).toBeNull();
  });
});
