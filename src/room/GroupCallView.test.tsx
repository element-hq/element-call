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
import {
  type MatrixClient,
  JoinRule,
  type RoomState,
  UnsupportedStickyEventsEndpointError,
} from "matrix-js-sdk";
import {
  MatrixRTCSessionEvent,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { BrowserRouter } from "react-router-dom";
import userEvent, {
  PointerEventsCheckLevel,
} from "@testing-library/user-event";
import { type RelationsContainer } from "matrix-js-sdk/lib/models/relations-container";
import { useState } from "react";
import { TooltipProvider } from "@vector-im/compound-web";

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
import { GroupCallErrorBoundary } from "./GroupCallErrorBoundary";
import {
  type HostBridge,
  HostBridgeProvider,
  nullHostBridge,
} from "../HostBridge";
import { MatrixRTCTransportMissingError } from "../utils/errors";
import { ProcessorProvider } from "../livekit/TrackProcessorContext";
import { MediaDevicesContext } from "../MediaDevicesContext";
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
    // Use globalThis rather than global because vite-plugin-node-polyfills seems
    // to rewrite global into an import which then interferes with vitest's hoisting
    // which runs before imports.
    (globalThis.ImageData = class MockImageData {
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
  hostBridge: HostBridge,
  joined = true,
  options: {
    withErrorBoundary?: boolean;
  } = {},
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
  const groupCallView = (
    <GroupCallView
      client={client}
      isPasswordlessUser={false}
      confineToRoom={false}
      preload={false}
      skipLobby={false}
      rtcSession={rtcSession.asMockedSession()}
      muteStates={muteState}
      // TODO-MULTI-SFU: Make joined and setJoined work
      joined={true}
      setJoined={function (value: boolean): void {}}
    />
  );
  const { getByText } = render(
    <BrowserRouter>
      <HostBridgeProvider value={hostBridge}>
        <TooltipProvider>
          <MediaDevicesContext value={mockMediaDevices({})}>
            <ProcessorProvider>
              {options.withErrorBoundary ? (
                <GroupCallErrorBoundary recoveryActionHandler={vi.fn()}>
                  {groupCallView}
                </GroupCallErrorBoundary>
              ) : (
                groupCallView
              )}
            </ProcessorProvider>
          </MediaDevicesContext>
        </TooltipProvider>
      </HostBridgeProvider>
    </BrowserRouter>,
  );
  return {
    getByText,
    rtcSession: rtcSession.asMockedSession(),
  };
}

test.skip("GroupCallView plays a leave sound asynchronously in SPA mode", async () => {
  const user = userEvent.setup();
  const { getByText, rtcSession } = createGroupCallView(nullHostBridge);
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
  const hostBridge: HostBridge = { ...nullHostBridge, close: vi.fn() };
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

  const { getByText, rtcSession } = createGroupCallView(hostBridge);
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

test("Should ask the host to close when all other left and play a sound", async () => {
  const user = userEvent.setup();
  const close = vi.fn().mockResolvedValue(undefined);
  const hostBridge: HostBridge = {
    ...nullHostBridge,
    setAlwaysOnScreen: vi.fn().mockResolvedValue(undefined),
    close,
  };
  const resolvePlaySound = Promise.withResolvers<void>();
  playSound = vi.fn().mockReturnValue(resolvePlaySound.promise);
  (useAudioContext as MockedFunction<typeof useAudioContext>).mockReturnValue({
    playSound,
    playSoundLooping: vitest.fn(),
    soundDuration: {},
  });

  const { getByText } = createGroupCallView(hostBridge);
  const leaveButton = getByText("SimulateOtherLeft");
  await user.click(leaveButton);
  await flushPromises();
  expect(close).not.toHaveBeenCalled();
  resolvePlaySound.resolve();

  expect(playSound).toHaveBeenCalledWith("left", 0);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
}, 80000);

test("Should not ask the host to close when auto leave due to error", async () => {
  const user = userEvent.setup();

  const close = vi.fn().mockResolvedValue(undefined);
  const setAlwaysOnScreen = vi.fn().mockResolvedValue(undefined);
  const hostBridge: HostBridge = {
    ...nullHostBridge,
    setAlwaysOnScreen,
    close,
  };

  const { getByText } = createGroupCallView(hostBridge);
  const leaveButton = getByText("SimulateErrorLeft");
  await user.click(leaveButton);
  await flushPromises();

  // When onLeft is called, we first set always on screen to false
  await waitFor(() => expect(setAlwaysOnScreen).toHaveBeenCalledWith(false));
  await flushPromises();
  // But then we do not ask to be closed automatically
  expect(close).not.toHaveBeenCalled();
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
  const { rtcSession } = createGroupCallView(nullHostBridge);
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
  createGroupCallView(nullHostBridge, false);
  await user.click(screen.getByRole("button", { name: "Join call" }));
  screen.getByText("Call is not supported");
});

test("translates wrapped UnsupportedStickyEventsEndpointError to the StickyEventsRequiredError screen", async () => {
  // Mirror the shape the SDK emits: the MembershipManager scheduler wraps
  // the original UnsupportedStickyEventsEndpointError in a generic Error
  // but preserves the original on `.cause`.
  const stickyError = new UnsupportedStickyEventsEndpointError(
    "Server does not support the sticky events",
    "sendStickyEvent",
  );
  const wrappedError = new Error(
    "The MembershipManager shut down because of the end condition: " +
      String(stickyError),
    { cause: stickyError },
  );

  const { rtcSession } = createGroupCallView(nullHostBridge, true, {
    withErrorBoundary: true,
  });

  await act(() =>
    rtcSession.emit(MatrixRTCSessionEvent.MembershipManagerError, wrappedError),
  );

  await screen.findByText("Homeserver does not support Matrix 2.0 calls");
});

test("falls back to ConnectionLostError for unrecognised membership manager errors", async () => {
  const { rtcSession } = createGroupCallView(nullHostBridge, true, {
    withErrorBoundary: true,
  });

  await act(() =>
    rtcSession.emit(
      MatrixRTCSessionEvent.MembershipManagerError,
      new Error("something else broke"),
    ),
  );

  await screen.findByText("Connection lost");
});

test("user can reconnect after a membership manager error", async () => {
  const user = userEvent.setup();
  const { rtcSession } = createGroupCallView(nullHostBridge, true);
  await act(() =>
    rtcSession.emit(MatrixRTCSessionEvent.MembershipManagerError, undefined),
  );
  // XXX: Wrapping the following click in act() shouldn't be necessary (the
  // async state update should be processed automatically by the waitFor call),
  // and yet here we are.
  await act(async () =>
    user
      // With css vitest turned on this test thinks that the button has pointer_events: none;.
      // TODO investigate if this is a test setup issue or an actual problem.
      .setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })
      .click(screen.getByRole("button", { name: "Reconnect" })),
  );
  // In-call controls should be visible again
  await waitFor(() => screen.getByRole("button", { name: "Leave" }));
});
