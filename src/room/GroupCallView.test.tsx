/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// TODO-MULTI-SFU: Restore or discard these tests. The role of GroupCallView has
// changed (it no longer manages the connection to the same extent), so they may
// need extra work to adapt.

import {
  beforeEach,
  expect,
  type MockedFunction,
  onTestFinished,
  test,
  vi,
  vitest,
} from "vitest";
import { render, waitFor, screen, act } from "@testing-library/react";
import { type MatrixClient, JoinRule, type RoomState } from "matrix-js-sdk";
import {
  MatrixRTCSessionEvent,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { type RelationsContainer } from "matrix-js-sdk/lib/models/relations-container";
import { useState } from "react";
import { TooltipProvider } from "@vector-im/compound-web";
import { type ITransport } from "matrix-widget-api";

import { prefetchSounds } from "../soundUtils";
import { useAudioContext } from "../useAudioContext";
import { ActiveCall } from "./InCallView";
import {
  flushPromises,
  mockEmitter,
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockMediaDevices,
  mockRtcMembership,
  MockRTCSession,
} from "../utils/test";
import { GroupCallView } from "./GroupCallView";
import { ElementWidgetActions, type WidgetHelpers } from "../widget";
import { LazyEventEmitter } from "../LazyEventEmitter";
import { MatrixRTCTransportMissingError } from "../utils/errors";
import { ProcessorProvider } from "../livekit/TrackProcessorContext";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { HeaderStyle } from "../UrlParams";
import { constant } from "../state/Behavior";
import { type MuteStates } from "../state/MuteStates.ts";

vi.mock("../soundUtils");
vi.mock("../useAudioContext");
vi.mock("./InCallView");
vi.mock("react-use-measure", () => ({
  default: (): [() => void, object] => [(): void => {}, {}],
}));

vi.hoisted(
  () =>
    (global.ImageData = class MockImageData {
      public data: number[] = [];
    } as unknown as typeof ImageData),
);

const enterRTCSession = vi.hoisted(() => vi.fn(async () => Promise.resolve()));
const leaveRTCSession = vi.hoisted(() =>
  vi.fn(
    async (
      rtcSession: unknown,
      cause: unknown,
      promiseBeforeHangup = Promise.resolve(),
    ) => await promiseBeforeHangup,
  ),
);

// vi.mock("../rtcSessionHelpers", async (importOriginal) => {
//   // TODO: perhaps there is a more elegant way to manage the type import here?
//   // eslint-disable-next-line @typescript-eslint/consistent-type-imports
//   const orig = await importOriginal<typeof import("../rtcSessionHelpers")>();
//   // TODO: leaveRTCSession no longer exists! Tests need adapting.
//   return { ...orig, enterRTCSession, leaveRTCSession };
// });

let playSound: MockedFunction<
  NonNullable<ReturnType<typeof useAudioContext>>["playSound"]
>;

const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
const carol = mockMatrixRoomMember(localRtcMember);
const roomMembers = new Map([carol].map((p) => [p.userId, p]));

const roomId = "!foo:bar";

beforeEach(() => {
  vi.clearAllMocks();
  (prefetchSounds as MockedFunction<typeof prefetchSounds>).mockResolvedValue({
    sound: new ArrayBuffer(0),
  });
  playSound = vi.fn();
  (useAudioContext as MockedFunction<typeof useAudioContext>).mockReturnValue({
    playSound,
    playSoundLooping: vi.fn(),
    soundDuration: {},
  });
  // A trivial implementation of Active call to ensure we are testing GroupCallView exclusively here.
  (ActiveCall as MockedFunction<typeof ActiveCall>).mockImplementation(
    ({ onLeft: onLeave }) => {
      return (
        <div>
          <button onClick={() => onLeave("user")}>Leave</button>
          <button onClick={() => onLeave("allOthersLeft")}>
            SimulateOtherLeft
          </button>
          <button onClick={() => onLeave("error")}>SimulateErrorLeft</button>
        </div>
      );
    },
  );
});

function createGroupCallView(
  widget: WidgetHelpers | null,
  joined = true,
): {
  rtcSession: MatrixRTCSession;
  getByText: ReturnType<typeof render>["getByText"];
} {
  const client = {
    getUser: () => null,
    getUserId: () => localRtcMember.userId,
    getDeviceId: () => localRtcMember.deviceId,
    getRoom: (rId) => (rId === roomId ? room : null),
  } as Partial<MatrixClient> as MatrixClient;
  const room = mockMatrixRoom({
    relations: {
      getChildEventsForEvent: () =>
        vi.mocked({
          getRelations: () => [],
        }),
    } as unknown as RelationsContainer,
    client,
    roomId,
    getMember: (userId) => roomMembers.get(userId) ?? null,
    getMxcAvatarUrl: () => null,
    getCanonicalAlias: () => null,
    currentState: {
      ...mockEmitter(),
      getJoinRule: () => JoinRule.Invite,
    } as Partial<RoomState> as RoomState,
  });
  const rtcSession = new MockRTCSession(room, []).withMemberships(
    constant([localRtcMember]),
  );
  rtcSession.joined = joined;
  const muteState = {
    audio: { enabled: false },
    video: { enabled: false },
    // TODO-MULTI-SFU: This cast isn't valid, it's likely the cause of some current test failures
  } as unknown as MuteStates;
  const { getByText } = render(
    <BrowserRouter>
      <TooltipProvider>
        <MediaDevicesContext value={mockMediaDevices({})}>
          <ProcessorProvider>
            <GroupCallView
              client={client}
              isPasswordlessUser={false}
              confineToRoom={false}
              preload={false}
              skipLobby={false}
              header={HeaderStyle.Standard}
              rtcSession={rtcSession.asMockedSession()}
              muteStates={muteState}
              widget={widget}
              // TODO-MULTI-SFU: Make joined and setJoined work
              joined={true}
              setJoined={function (value: boolean): void {}}
            />
          </ProcessorProvider>
        </MediaDevicesContext>
      </TooltipProvider>
    </BrowserRouter>,
  );
  return {
    getByText,
    rtcSession: rtcSession.asMockedSession(),
  };
}

test.skip("GroupCallView plays a leave sound asynchronously in SPA mode", async () => {
  const user = userEvent.setup();
  const { getByText, rtcSession } = createGroupCallView(null);
  const leaveButton = getByText("Leave");
  await user.click(leaveButton);
  expect(playSound).toHaveBeenCalledWith("left");
  expect(leaveRTCSession).toHaveBeenCalledWith(
    rtcSession,
    "user",
    expect.any(Promise),
  );
  expect(leaveRTCSession).toHaveBeenCalledOnce();
  // Ensure that the playSound promise resolves within this test to avoid
  // impacting the results of other tests
  await waitFor(() => expect(leaveRTCSession).toHaveResolved());
});

test.skip("GroupCallView plays a leave sound synchronously in widget mode", async () => {
  const user = userEvent.setup();
  const widget = {
    api: {
      setAlwaysOnScreen: async () => Promise.resolve(true),
    } as Partial<WidgetHelpers["api"]>,
    lazyActions: new LazyEventEmitter(),
  };
  let resolvePlaySound: () => void;
  playSound = vi
    .fn()
    .mockReturnValue(
      new Promise<void>((resolve) => (resolvePlaySound = resolve)),
    );
  (useAudioContext as MockedFunction<typeof useAudioContext>).mockReturnValue({
    playSound,
    playSoundLooping: vitest.fn(),
    soundDuration: {},
  });

  const { getByText, rtcSession } = createGroupCallView(
    widget as WidgetHelpers,
  );
  const leaveButton = getByText("Leave");
  await user.click(leaveButton);
  await flushPromises();
  expect(leaveRTCSession).not.toHaveResolved();
  resolvePlaySound!();
  await flushPromises();

  expect(playSound).toHaveBeenCalledWith("left");
  expect(leaveRTCSession).toHaveBeenCalledWith(
    rtcSession,
    "user",
    expect.any(Promise),
  );
  expect(leaveRTCSession).toHaveBeenCalledOnce();
});

test.skip("Should close widget when all other left and have time to play a sound", async () => {
  const user = userEvent.setup();
  const widgetClosedCalled = Promise.withResolvers<void>();
  const widgetSendMock = vi.fn().mockImplementation((action: string) => {
    if (action === ElementWidgetActions.Close) {
      widgetClosedCalled.resolve();
    }
  });
  const widgetStopMock = vi.fn().mockResolvedValue(undefined);
  const widget = {
    api: {
      setAlwaysOnScreen: vi.fn().mockResolvedValue(true),
      transport: {
        send: widgetSendMock,
        reply: vi.fn().mockResolvedValue(undefined),
        stop: widgetStopMock,
      } as unknown as ITransport,
    } as Partial<WidgetHelpers["api"]>,
    lazyActions: new LazyEventEmitter(),
  };
  const resolvePlaySound = Promise.withResolvers<void>();
  playSound = vi.fn().mockReturnValue(resolvePlaySound);
  (useAudioContext as MockedFunction<typeof useAudioContext>).mockReturnValue({
    playSound,
    playSoundLooping: vitest.fn(),
    soundDuration: {},
  });

  const { getByText } = createGroupCallView(widget as WidgetHelpers);
  const leaveButton = getByText("SimulateOtherLeft");
  await user.click(leaveButton);
  await flushPromises();
  expect(widgetSendMock).not.toHaveBeenCalled();
  resolvePlaySound.resolve();
  await flushPromises();

  expect(playSound).toHaveBeenCalledWith("left");

  await widgetClosedCalled.promise;
  await flushPromises();
  expect(widgetStopMock).toHaveBeenCalledOnce();
});

test("Should close widget when all other left", async () => {
  const user = userEvent.setup();
  const widgetClosedCalled = Promise.withResolvers<void>();
  const widgetSendMock = vi.fn().mockImplementation((action: string) => {
    if (action === ElementWidgetActions.Close) {
      widgetClosedCalled.resolve();
    }
  });
  const widgetStopMock = vi.fn().mockResolvedValue(undefined);
  const widget = {
    api: {
      setAlwaysOnScreen: vi.fn().mockResolvedValue(true),
      transport: {
        send: widgetSendMock,
        reply: vi.fn().mockResolvedValue(undefined),
        stop: widgetStopMock,
      } as unknown as ITransport,
    } as Partial<WidgetHelpers["api"]>,
    lazyActions: new LazyEventEmitter(),
  };

  const { getByText } = createGroupCallView(widget as WidgetHelpers);
  const leaveButton = getByText("SimulateOtherLeft");
  await user.click(leaveButton);
  await flushPromises();

  await widgetClosedCalled.promise;
  await flushPromises();
  expect(widgetStopMock).toHaveBeenCalledOnce();
});

test("Should not close widget when auto leave due to error", async () => {
  const user = userEvent.setup();

  const widgetStopMock = vi.fn().mockResolvedValue(undefined);
  const widgetSendMock = vi.fn().mockResolvedValue(undefined);
  const widget = {
    api: {
      setAlwaysOnScreen: vi.fn().mockResolvedValue(true),
      transport: {
        send: widgetSendMock,
        reply: vi.fn().mockResolvedValue(undefined),
        stop: widgetStopMock,
      } as unknown as ITransport,
    } as Partial<WidgetHelpers["api"]>,
    lazyActions: new LazyEventEmitter(),
  };

  const alwaysOnScreenSpy = vi.spyOn(widget.api, "setAlwaysOnScreen");

  const { getByText } = createGroupCallView(widget as WidgetHelpers);
  const leaveButton = getByText("SimulateErrorLeft");
  await user.click(leaveButton);
  await flushPromises();

  // When onLeft is called, we first set always on screen to false
  await waitFor(() => expect(alwaysOnScreenSpy).toHaveBeenCalledWith(false));
  await flushPromises();
  // But then we do not close the widget automatically
  expect(widgetStopMock).not.toHaveBeenCalledOnce();
  expect(widgetSendMock).not.toHaveBeenCalledOnce();
});

test.skip("GroupCallView leaves the session when an error occurs", async () => {
  (ActiveCall as MockedFunction<typeof ActiveCall>).mockImplementation(() => {
    const [error, setError] = useState<Error | null>(null);
    if (error !== null) throw error;
    return (
      <div>
        <button onClick={() => setError(new Error())}>Panic!</button>
      </div>
    );
  });
  const user = userEvent.setup();
  const { rtcSession } = createGroupCallView(null);
  await user.click(screen.getByRole("button", { name: "Panic!" }));
  screen.getByText("Something went wrong");
  expect(leaveRTCSession).toHaveBeenCalledWith(
    rtcSession,
    "error",
    expect.any(Promise),
  );
});

test.skip("GroupCallView shows errors that occur during joining", async () => {
  const user = userEvent.setup();
  // This should not mock this error that deep. it should only mock the CallViewModel.
  enterRTCSession.mockRejectedValue(new MatrixRTCTransportMissingError(""));
  onTestFinished(() => {
    enterRTCSession.mockReset();
  });
  createGroupCallView(null, false);
  await user.click(screen.getByRole("button", { name: "Join call" }));
  screen.getByText("Call is not supported");
});

test("user can reconnect after a membership manager error", async () => {
  const user = userEvent.setup();
  const { rtcSession } = createGroupCallView(null, true);
  await act(() =>
    rtcSession.emit(MatrixRTCSessionEvent.MembershipManagerError, undefined),
  );
  // XXX: Wrapping the following click in act() shouldn't be necessary (the
  // async state update should be processed automatically by the waitFor call),
  // and yet here we are.
  await act(async () =>
    user.click(screen.getByRole("button", { name: "Reconnect" })),
  );
  // In-call controls should be visible again
  await waitFor(() => screen.getByRole("button", { name: "Leave" }));
});
