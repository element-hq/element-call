/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { beforeEach, expect, type MockedFunction, test, vitest } from "vitest";
import { render } from "@testing-library/react";
import { type MatrixClient } from "matrix-js-sdk/src/client";
import { type MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc";
import { of } from "rxjs";
import { JoinRule, type RoomState } from "matrix-js-sdk/src/matrix";
import { Router } from "react-router-dom";
import { createBrowserHistory } from "history";
import userEvent from "@testing-library/user-event";
import { type RelationsContainer } from "matrix-js-sdk/src/models/relations-container";

import { type MuteStates } from "./MuteStates";
import { prefetchSounds } from "../soundUtils";
import { useAudioContext } from "../useAudioContext";
import { ActiveCall } from "./InCallView";
import {
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockRtcMembership,
  MockRTCSession,
} from "../utils/test";
import { GroupCallView } from "./GroupCallView";
import { leaveRTCSession } from "../rtcSessionHelpers";
import { type WidgetHelpers } from "../widget";
import { LazyEventEmitter } from "../LazyEventEmitter";

vitest.mock("../soundUtils");
vitest.mock("../useAudioContext");
vitest.mock("./InCallView");

vitest.mock("../rtcSessionHelpers", async (importOriginal) => {
  // TODO: perhaps there is a more elegant way to manage the type import here?
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const orig = await importOriginal<typeof import("../rtcSessionHelpers")>();
  vitest.spyOn(orig, "leaveRTCSession");
  return orig;
});

let playSound: MockedFunction<
  NonNullable<ReturnType<typeof useAudioContext>>["playSound"]
>;

const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
const carol = mockMatrixRoomMember(localRtcMember);
const roomMembers = new Map([carol].map((p) => [p.userId, p]));

const roomId = "!foo:bar";
const soundPromise = Promise.resolve(true);

beforeEach(() => {
  (prefetchSounds as MockedFunction<typeof prefetchSounds>).mockResolvedValue({
    sound: new ArrayBuffer(0),
  });
  playSound = vitest.fn().mockReturnValue(soundPromise);
  (useAudioContext as MockedFunction<typeof useAudioContext>).mockReturnValue({
    playSound,
  });
  // A trivial implementation of Active call to ensure we are testing GroupCallView exclusively here.
  (ActiveCall as MockedFunction<typeof ActiveCall>).mockImplementation(
    ({ onLeave }) => {
      return (
        <div>
          <button onClick={() => onLeave()}>Leave</button>
        </div>
      );
    },
  );
});

function createGroupCallView(widget: WidgetHelpers | null): {
  rtcSession: MockRTCSession;
  getByText: ReturnType<typeof render>["getByText"];
} {
  const history = createBrowserHistory();
  const client = {
    getUser: () => null,
    getUserId: () => localRtcMember.sender,
    getDeviceId: () => localRtcMember.deviceId,
    getRoom: (rId) => (rId === roomId ? room : null),
  } as Partial<MatrixClient> as MatrixClient;
  const room = mockMatrixRoom({
    relations: {
      getChildEventsForEvent: () =>
        vitest.mocked({
          getRelations: () => [],
        }),
    } as unknown as RelationsContainer,
    client,
    roomId,
    getMember: (userId) => roomMembers.get(userId) ?? null,
    getMxcAvatarUrl: () => null,
    getCanonicalAlias: () => null,
    currentState: {
      getJoinRule: () => JoinRule.Invite,
    } as Partial<RoomState> as RoomState,
  });
  const rtcSession = new MockRTCSession(
    room,
    localRtcMember,
    [],
  ).withMemberships(of([]));
  const muteState = {
    audio: { enabled: false },
    video: { enabled: false },
  } as MuteStates;
  const { getByText } = render(
    <Router history={history}>
      <GroupCallView
        client={client}
        isPasswordlessUser={false}
        confineToRoom={false}
        preload={false}
        skipLobby={false}
        hideHeader={true}
        rtcSession={rtcSession as unknown as MatrixRTCSession}
        muteStates={muteState}
        widget={widget}
      />
    </Router>,
  );
  return {
    getByText,
    rtcSession,
  };
}

test("will play a leave sound asynchronously in SPA mode", async () => {
  const user = userEvent.setup();
  const { getByText, rtcSession } = createGroupCallView(null);
  const leaveButton = getByText("Leave");
  await user.click(leaveButton);
  expect(playSound).toHaveBeenCalledWith("left");
  expect(leaveRTCSession).toHaveBeenCalledWith(rtcSession, undefined);
  expect(rtcSession.leaveRoomSession).toHaveBeenCalledOnce();
});

test("will play a leave sound synchronously in widget mode", async () => {
  const user = userEvent.setup();
  const widget = {
    api: {
      setAlwaysOnScreen: async () => Promise.resolve(true),
    } as Partial<WidgetHelpers["api"]>,
    lazyActions: new LazyEventEmitter(),
  };
  const { getByText, rtcSession } = createGroupCallView(
    widget as WidgetHelpers,
  );
  const leaveButton = getByText("Leave");
  await user.click(leaveButton);
  expect(playSound).toHaveBeenCalledWith("left");
  expect(leaveRTCSession).toHaveBeenCalledWith(rtcSession, soundPromise);
  expect(rtcSession.leaveRoomSession).toHaveBeenCalledOnce();
});
