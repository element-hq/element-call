/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import {
  afterAll,
  beforeEach,
  expect,
  MockedFunction,
  test,
  vitest,
} from "vitest";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { ConnectionState } from "livekit-client";
import { BehaviorSubject, of } from "rxjs";
import { afterEach } from "node:test";
import { act, ReactNode } from "react";
import {
  CallMembership,
  type MatrixRTCSession,
} from "matrix-js-sdk/src/matrixrtc";
import { RoomMember } from "matrix-js-sdk/src/matrix";

import {
  mockLivekitRoom,
  mockLocalParticipant,
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockRemoteParticipant,
  mockRtcMembership,
  MockRTCSession,
} from "../utils/test";
import { E2eeType } from "../e2ee/e2eeType";
import { CallViewModel } from "../state/CallViewModel";
import {
  CallEventAudioRenderer,
  MAX_PARTICIPANT_COUNT_FOR_SOUND,
} from "./CallEventAudioRenderer";
import { useAudioContext } from "../useAudioContext";
import { TestReactionsWrapper } from "../utils/testReactions";
import { prefetchSounds } from "../soundUtils";

const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
const local = mockMatrixRoomMember(localRtcMember);
const aliceRtcMember = mockRtcMembership("@alice:example.org", "AAAA");
const alice = mockMatrixRoomMember(aliceRtcMember);
const bobRtcMember = mockRtcMembership("@bob:example.org", "BBBB");
const localParticipant = mockLocalParticipant({ identity: "" });
const aliceId = `${alice.userId}:${aliceRtcMember.deviceId}`;
const aliceParticipant = mockRemoteParticipant({ identity: aliceId });

vitest.mock("../useAudioContext");
vitest.mock("../soundUtils");

afterEach(() => {
  vitest.resetAllMocks();
});

afterAll(() => {
  vitest.restoreAllMocks();
});

let playSound: MockedFunction<
  NonNullable<ReturnType<typeof useAudioContext>>["playSound"]
>;

beforeEach(() => {
  (prefetchSounds as MockedFunction<typeof prefetchSounds>).mockResolvedValue({
    sound: new ArrayBuffer(0),
  });
  playSound = vitest.fn();
  (useAudioContext as MockedFunction<typeof useAudioContext>).mockReturnValue({
    playSound,
  });
});

function TestComponent({
  rtcSession,
  vm,
}: {
  rtcSession: MockRTCSession;
  vm: CallViewModel;
}): ReactNode {
  return (
    <TestReactionsWrapper
      rtcSession={rtcSession as unknown as MatrixRTCSession}
    >
      <CallEventAudioRenderer vm={vm} />
    </TestReactionsWrapper>
  );
}

function getMockEnv(
  members: RoomMember[],
  initialRemoteRtcMemberships: CallMembership[] = [aliceRtcMember],
): {
  vm: CallViewModel;
  session: MockRTCSession;
  remoteRtcMemberships: BehaviorSubject<CallMembership[]>;
} {
  const matrixRoomMembers = new Map(members.map((p) => [p.userId, p]));
  const remoteParticipants = of([aliceParticipant]);
  const liveKitRoom = mockLivekitRoom(
    { localParticipant },
    { remoteParticipants },
  );
  const matrixRoom = mockMatrixRoom({
    client: {
      getUserId: () => localRtcMember.sender,
      getDeviceId: () => localRtcMember.deviceId,
      on: vitest.fn(),
      off: vitest.fn(),
    } as Partial<MatrixClient> as MatrixClient,
    getMember: (userId) => matrixRoomMembers.get(userId) ?? null,
  });

  const remoteRtcMemberships = new BehaviorSubject<CallMembership[]>(
    initialRemoteRtcMemberships,
  );

  const session = new MockRTCSession(
    matrixRoom,
    localRtcMember,
  ).withMemberships(remoteRtcMemberships);

  const vm = new CallViewModel(
    session as unknown as MatrixRTCSession,
    liveKitRoom,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    of(ConnectionState.Connected),
  );
  return { vm, session, remoteRtcMemberships };
}

/**
 * We don't want to play a sound when loading the call state
 * because typically this occurs in two stages. We first join
 * the call as a local participant and *then* the remote
 * participants join from our perspective. We don't want to make
 * a noise every time.
 */
test("plays one sound when entering a call", () => {
  const { session, vm, remoteRtcMemberships } = getMockEnv([local, alice]);
  render(<TestComponent rtcSession={session} vm={vm} />);
  // Joining a call usually means remote participants are added later.
  act(() => {
    remoteRtcMemberships.next([aliceRtcMember, bobRtcMember]);
  });
  expect(playSound).toHaveBeenCalledOnce();
});

// TODO: Same test?
test("plays a sound when a user joins", () => {
  const { session, vm, remoteRtcMemberships } = getMockEnv([local, alice]);
  render(<TestComponent rtcSession={session} vm={vm} />);

  act(() => {
    remoteRtcMemberships.next([aliceRtcMember, bobRtcMember]);
  });
  // Play a sound when joining a call.
  expect(playSound).toBeCalledWith("join");
});

test("plays a sound when a user leaves", () => {
  const { session, vm, remoteRtcMemberships } = getMockEnv([local, alice]);
  render(<TestComponent rtcSession={session} vm={vm} />);

  act(() => {
    remoteRtcMemberships.next([]);
  });
  expect(playSound).toBeCalledWith("left");
});

test("plays no sound when the participant list is more than the maximum size", () => {
  const mockRtcMemberships: CallMembership[] = [];
  for (let i = 0; i < MAX_PARTICIPANT_COUNT_FOR_SOUND; i++) {
    mockRtcMemberships.push(
      mockRtcMembership(`@user${i}:example.org`, `DEVICE${i}`),
    );
  }

  const { session, vm, remoteRtcMemberships } = getMockEnv(
    [local, alice],
    mockRtcMemberships,
  );

  render(<TestComponent rtcSession={session} vm={vm} />);
  expect(playSound).not.toBeCalled();
  act(() => {
    remoteRtcMemberships.next(
      mockRtcMemberships.slice(0, MAX_PARTICIPANT_COUNT_FOR_SOUND - 1),
    );
  });
  expect(playSound).toBeCalledWith("left");
});
