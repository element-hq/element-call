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
  testScope,
} from "../../../utils/test";
import {
  FakeParticipation,
  fakeConnection,
} from "../../../utils/test-participation";
import { type ConnectionFactory } from "./ConnectionFactory";
import { createParticipationConnectionManager$ } from "./ParticipationConnections";

interface Created {
  serviceUrl: string;
  jwt: string | undefined;
  url: string | undefined;
}

function recordingFactory(): {
  factory: ConnectionFactory;
  created: Created[];
} {
  const created: Created[] = [];
  const factory: ConnectionFactory = {
    createConnection(scope, transport, ownMembershipIdentity, logger, sfu) {
      created.push({
        serviceUrl: transport.livekit_service_url,
        jwt: sfu?.jwt,
        url: sfu?.url,
      });
      return new MockConnection(
        {
          scope,
          transport,
          ownMembershipIdentity,
          existingSFUConfig: sfu,
          client: null,
          roomId: "!room:example.org",
          livekitRoomFactory: () =>
            mockLivekitRoom({
              localParticipant: mockLocalParticipant({ identity: "" }),
              remoteParticipants: new Map(),
            }),
        },
        logger,
      );
    },
  };
  return { factory, created };
}

describe("createParticipationConnectionManager$", () => {
  it("opens one connection per service with the crate's token and keeps it across a refresh", () => {
    const scope = testScope();
    const participation = new FakeParticipation();
    const { factory, created } = recordingFactory();
    const manager = createParticipationConnectionManager$({
      scope,
      participation,
      connectionFactory: factory,
      ownIdentity: { userId: "@me:example.org", deviceId: "MYDEV" },
      logger,
    });
    expect(manager.connectionManagerData$.value.value.getConnections()).toEqual(
      [],
    );

    participation.connections$.next([
      fakeConnection({ serviceUrl: "https://a", jwtToken: "t1" }),
    ]);
    expect(created).toEqual([
      { serviceUrl: "https://a", jwt: "t1", url: "wss://a" },
    ]);
    const data = manager.connectionManagerData$.value.value;
    expect(data.getConnections()).toHaveLength(1);
    expect(
      data.getConnectionForTransport({
        type: "livekit",
        livekit_service_url: "https://a",
      })?.transport.livekit_service_url,
    ).toBe("https://a");

    // The crate refreshed the token: the same connection stays up.
    participation.connections$.next([
      fakeConnection({ serviceUrl: "https://a", jwtToken: "t2" }),
    ]);
    expect(created).toHaveLength(1);

    // A second service appears; the first is untouched.
    participation.connections$.next([
      fakeConnection({ serviceUrl: "https://a", jwtToken: "t2" }),
      fakeConnection({ serviceUrl: "https://b", jwtToken: "t3" }),
    ]);
    expect(created.map((c) => c.serviceUrl)).toEqual([
      "https://a",
      "https://b",
    ]);
    expect(
      manager.connectionManagerData$.value.value.getConnections(),
    ).toHaveLength(2);

    // Everybody left the first service: its connection goes away.
    participation.connections$.next([
      fakeConnection({ serviceUrl: "https://b", jwtToken: "t3" }),
    ]);
    expect(
      manager.connectionManagerData$.value.value
        .getConnections()
        .map((c) => c.transport.livekit_service_url),
    ).toEqual(["https://b"]);
  });
});
