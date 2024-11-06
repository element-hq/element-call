/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { act, render } from "@testing-library/react";
import { FC, ReactNode } from "react";
import { describe, expect, test } from "vitest";
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import {
  EventTimeline,
  EventTimelineSet,
  EventType,
  MatrixClient,
  MatrixEvent,
  Room,
  RoomEvent,
} from "matrix-js-sdk/src/matrix";
import EventEmitter from "events";
import { randomUUID } from "crypto";

import { ReactionsProvider, useReactions } from "./useReactions";

/**
 * Test explanation.
 * This test suite checks that the useReactions hook appropriately reacts
 * to new reactions, redactions and membership changesin the room. There is
 * a large amount of test structure used to construct a mock environment.
 */

const memberUserIdAlice = "@alice:example.org";
const memberEventAlice = "$membership-alice:example.org";
const memberUserIdBob = "@bob:example.org";
const memberEventBob = "$membership-bob:example.org";

const membership: Record<string, string> = {
  [memberEventAlice]: memberUserIdAlice,
  [memberEventBob]: memberUserIdBob,
  "$membership-charlie:example.org": "@charlie:example.org",
};

const TestComponent: FC = () => {
  const { raisedHands } = useReactions();
  return (
    <div>
      <ul>
        {Object.entries(raisedHands).map(([userId, date]) => (
          <li key={userId}>
            <span>{userId}</span>
            <time>{date.getTime()}</time>
          </li>
        ))}
      </ul>
    </div>
  );
};

const TestComponentWrapper = ({
  rtcSession,
}: {
  rtcSession: MockRTCSession;
}): ReactNode => {
  return (
    <ReactionsProvider rtcSession={rtcSession as unknown as MatrixRTCSession}>
      <TestComponent />
    </ReactionsProvider>
  );
};

export class MockRTCSession extends EventEmitter {
  public memberships = Object.entries(membership).map(([eventId, sender]) => ({
    sender,
    eventId,
    createdTs: (): Date => new Date(),
  }));

  public constructor(public readonly room: MockRoom) {
    super();
  }

  public testRemoveMember(userId: string): void {
    this.memberships = this.memberships.filter((u) => u.sender !== userId);
    this.emit(MatrixRTCSessionEvent.MembershipsChanged);
  }

  public testAddMember(sender: string): void {
    this.memberships.push({
      sender,
      eventId: `!fake-${randomUUID()}:event`,
      createdTs: (): Date => new Date(),
    });
    this.emit(MatrixRTCSessionEvent.MembershipsChanged);
  }
}

function createReaction(
  parentMemberEvent: string,
  overridenSender?: string,
): MatrixEvent {
  return new MatrixEvent({
    sender: overridenSender ?? membership[parentMemberEvent],
    type: EventType.Reaction,
    origin_server_ts: new Date().getTime(),
    content: {
      "m.relates_to": {
        key: "🖐️",
        event_id: parentMemberEvent,
      },
    },
    event_id: randomUUID(),
  });
}

function createRedaction(sender: string, reactionEventId: string): MatrixEvent {
  return new MatrixEvent({
    sender,
    type: EventType.RoomRedaction,
    origin_server_ts: new Date().getTime(),
    redacts: reactionEventId,
    content: {},
    event_id: randomUUID(),
  });
}

export class MockRoom extends EventEmitter {
  public constructor(private readonly existingRelations: MatrixEvent[] = []) {
    super();
  }

  public get client(): MatrixClient {
    return {
      getUserId: (): string => memberUserIdAlice,
    } as unknown as MatrixClient;
  }

  public get relations(): Room["relations"] {
    return {
      getChildEventsForEvent: (membershipEventId: string) => ({
        getRelations: (): MatrixEvent[] => {
          return this.existingRelations.filter(
            (r) =>
              r.getContent()["m.relates_to"]?.event_id === membershipEventId,
          );
        },
      }),
    } as unknown as Room["relations"];
  }

  public testSendReaction(
    parentMemberEvent: string,
    overridenSender?: string,
  ): string {
    const evt = createReaction(parentMemberEvent, overridenSender);
    this.emit(RoomEvent.Timeline, evt, this, undefined, false, {
      timeline: new EventTimeline(new EventTimelineSet(undefined)),
    });
    return evt.getId()!;
  }
}

describe("useReactions", () => {
  test("starts with an empty list", () => {
    const rtcSession = new MockRTCSession(new MockRoom());
    const { queryByRole } = render(
      <TestComponentWrapper rtcSession={rtcSession} />,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("handles incoming raised hand", async () => {
    const room = new MockRoom();
    const rtcSession = new MockRTCSession(room);
    const { queryByRole } = render(
      <TestComponentWrapper rtcSession={rtcSession} />,
    );
    await act(() => room.testSendReaction(memberEventAlice));
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
    await act(() => room.testSendReaction(memberEventBob));
    expect(queryByRole("list")?.children).to.have.lengthOf(2);
  });
  test("handles incoming unraised hand", async () => {
    const room = new MockRoom();
    const rtcSession = new MockRTCSession(room);
    const { queryByRole } = render(
      <TestComponentWrapper rtcSession={rtcSession} />,
    );
    const reactionEventId = await act(() =>
      room.testSendReaction(memberEventAlice),
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
    await act(() =>
      room.emit(
        RoomEvent.Redaction,
        createRedaction(memberUserIdAlice, reactionEventId),
        room,
        undefined,
      ),
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("handles loading prior raised hand events", () => {
    const room = new MockRoom([createReaction(memberEventAlice)]);
    const rtcSession = new MockRTCSession(room);
    const { queryByRole } = render(
      <TestComponentWrapper rtcSession={rtcSession} />,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
  });
  // If the membership event changes for a user, we want to remove
  // the raised hand event.
  test("will remove reaction when a member leaves the call", () => {
    const room = new MockRoom([createReaction(memberEventAlice)]);
    const rtcSession = new MockRTCSession(room);
    const { queryByRole } = render(
      <TestComponentWrapper rtcSession={rtcSession} />,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
    act(() => rtcSession.testRemoveMember(memberUserIdAlice));
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("will remove reaction when a member joins via a new event", () => {
    const room = new MockRoom([createReaction(memberEventAlice)]);
    const rtcSession = new MockRTCSession(room);
    const { queryByRole } = render(
      <TestComponentWrapper rtcSession={rtcSession} />,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(1);
    // Simulate leaving and rejoining
    act(() => {
      rtcSession.testRemoveMember(memberUserIdAlice);
      rtcSession.testAddMember(memberUserIdAlice);
    });
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("ignores invalid sender for historic event", () => {
    const room = new MockRoom([
      createReaction(memberEventAlice, memberUserIdBob),
    ]);
    const rtcSession = new MockRTCSession(room);
    const { queryByRole } = render(
      <TestComponentWrapper rtcSession={rtcSession} />,
    );
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
  test("ignores invalid sender for new event", async () => {
    const room = new MockRoom([]);
    const rtcSession = new MockRTCSession(room);
    const { queryByRole } = render(
      <TestComponentWrapper rtcSession={rtcSession} />,
    );
    await act(() => room.testSendReaction(memberEventAlice, memberUserIdBob));
    expect(queryByRole("list")?.children).to.have.lengthOf(0);
  });
});
