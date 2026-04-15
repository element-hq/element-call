/*
Copyright 2025 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  vi,
} from "vitest";
import { render, type RenderResult } from "@testing-library/react";
import { type LocalParticipant } from "livekit-client";
import { BehaviorSubject, of } from "rxjs";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@vector-im/compound-web";
import { RoomContext, useLocalParticipant } from "@livekit/components-react";
import userEvent from "@testing-library/user-event";

import { InCallView } from "./InCallView";
import {
  mockLivekitRoom,
  mockLocalParticipant,
  mockMediaDevices,
  mockMuteStates,
  mockRemoteParticipant,
  mockRtcMembership,
  type MockRTCSession,
} from "../utils/test";
import { E2eeType } from "../e2ee/e2eeType";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import { type CallViewModelOptions } from "../state/CallViewModel/CallViewModel";
import { alice, local } from "../utils/test-fixtures";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";
import { LivekitRoomAudioRenderer } from "../livekit/MatrixAudioRenderer";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type MediaDevices as ECMediaDevices } from "../state/MediaDevices";
import { constant } from "../state/Behavior";
import { AppBar } from "../AppBar";
import { initializeWidget } from "../widget";

initializeWidget();
vi.hoisted(
  () =>
    (global.ImageData = class MockImageData {
      public data: number[] = [];
    } as unknown as typeof ImageData),
);

vi.mock("../soundUtils");
vi.mock("../useAudioContext");
vi.mock("../tile/GridTile");
vi.mock("../tile/SpotlightTile");
vi.mock("@livekit/components-react");
vi.mock("livekit-client/e2ee-worker?worker");
vi.mock("../e2ee/sharedKeyManagement");
vi.mock("../livekit/MatrixAudioRenderer");
vi.mock("react-use-measure", () => ({
  default: (): [() => void, object] => [(): void => {}, {}],
}));

const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
const localParticipant = mockLocalParticipant({
  identity: "@local:example.org:AAAAAA",
});
const remoteParticipant = mockRemoteParticipant({
  identity: "@alice:example.org:AAAAAA",
});

let useRoomEncryptionSystemMock: MockedFunction<typeof useRoomEncryptionSystem>;

beforeEach(() => {
  vi.clearAllMocks();

  // MatrixAudioRenderer is tested separately.
  (
    LivekitRoomAudioRenderer as MockedFunction<typeof LivekitRoomAudioRenderer>
  ).mockImplementation((_props) => {
    return <div>mocked: MatrixAudioRenderer</div>;
  });
  (
    useLocalParticipant as MockedFunction<typeof useLocalParticipant>
  ).mockImplementation(
    () =>
      ({
        isScreenShareEnabled: false,
        localParticipant: localRtcMember as unknown as LocalParticipant,
      }) as unknown as ReturnType<typeof useLocalParticipant>,
  );
  useRoomEncryptionSystemMock =
    useRoomEncryptionSystem as typeof useRoomEncryptionSystemMock;
  useRoomEncryptionSystemMock.mockReturnValue({ kind: E2eeType.NONE });
});
interface CreateInCallViewArgs {
  mediaDevices?: ECMediaDevices;
  callViewModelOptions?: Partial<CallViewModelOptions>;
  /** If set, uses a MemoryRouter with this as the initial entry instead of BrowserRouter */
  initialRoute?: string;
  /** If true, wraps the rendered tree in an AppBar provider */
  withAppBar?: boolean;
}
function createInCallView(args: CreateInCallViewArgs = {}): RenderResult & {
  rtcSession: MockRTCSession;
} {
  const mediaDevices = args.mediaDevices ?? mockMediaDevices({});
  const muteState = mockMuteStates();
  const livekitRoom = mockLivekitRoom(
    {
      localParticipant,
    },
    {
      remoteParticipants$: of([remoteParticipant]),
    },
  );
  const { vm, rtcSession } = getBasicCallViewModelEnvironment(
    [local, alice],
    undefined,
    mediaDevices,
    args.callViewModelOptions,
  );

  rtcSession.joined = true;
  const room = rtcSession.room;
  const client = room.client;

  const Router = args.initialRoute
    ? ({ children }: { children: React.ReactNode }): React.ReactNode => (
        <MemoryRouter initialEntries={[args.initialRoute!]}>
          {children}
        </MemoryRouter>
      )
    : BrowserRouter;

  const inCallView = (
    <InCallView
      client={client}
      rtcSession={rtcSession.asMockedSession()}
      muteStates={muteState}
      vm={vm}
      matrixInfo={{
        userId: "",
        displayName: "",
        avatarUrl: "",
        roomId: "",
        roomName: "",
        roomAlias: null,
        roomAvatar: null,
        e2eeSystem: {
          kind: E2eeType.NONE,
        },
      }}
      matrixRoom={room}
      onShareClick={null}
    />
  );

  const content = args.withAppBar ? <AppBar>{inCallView}</AppBar> : inCallView;

  const renderResult = render(
    <Router>
      <MediaDevicesContext value={mediaDevices}>
        <ReactionsSenderProvider
          vm={vm}
          rtcSession={rtcSession.asMockedSession()}
        >
          <TooltipProvider>
            <RoomContext value={livekitRoom}>{content}</RoomContext>
          </TooltipProvider>
        </ReactionsSenderProvider>
      </MediaDevicesContext>
    </Router>,
  );
  return {
    ...renderResult,
    rtcSession,
  };
}

describe("InCallView", () => {
  describe("rendering", () => {
    it("renders", () => {
      const { container } = createInCallView();
      expect(container).toMatchSnapshot();
    });
  });
  describe("settings button with AppBar header", () => {
    it("mobile landscape, is accessible when showHeader is false", () => {
      // windowSize with height <= 600 results in "flat" windowMode,
      // which means showHeader$ emits false.
      const { getAllByRole } = createInCallView({
        initialRoute: "/?header=app_bar",
        withAppBar: true,
        callViewModelOptions: {
          // Set windowMode$ to "flat" (height <= 600)
          windowSize$: constant({ width: 1000, height: 500 }),
        },
      });
      // When showHeader is false, hideSettingsButton is false,
      // so the settings button is visible in the footer.
      const settingsBtn = getAllByRole("button", { name: "Settings" });
      // here we check for two settings buttons because there are two buttons in the bottom bar. One for the
      // the narrow layout and another one for the wide layout.
      // Their visibility uses @media css queries, which cannot be tested in JSDOM,
      // but we can at least check that both buttons are rendered and have the correct classes.
      expect(settingsBtn.length).toBe(2);
      expect(settingsBtn[0]).toHaveAttribute(
        "data-testid",
        "settings-bottom-left",
      );
      expect(settingsBtn[0]).toBeVisible();
    });

    it("mobile portrait, is accessible when showHeader is true", () => {
      // windowSize with height > 600 and width > 600 results in "normal" windowMode,
      // which means showHeader$ emits true.
      const { getAllByRole } = createInCallView({
        initialRoute: "/?header=app_bar",
        withAppBar: true,
        callViewModelOptions: {
          // Set windowMode$ to "normal" (height >= 600)
          windowSize$: constant({ width: 1000, height: 800 }),
        },
      });
      // When showHeader is true and headerStyle is AppBar,
      // hideSettingsButton is true in the footer, but the settings
      // button is rendered in the AppBar via useAppBarSecondaryButton.
      const settingsBtns = getAllByRole("button", { name: "Settings" });

      expect(settingsBtns.length).toBe(1);
      expect(settingsBtns[0]).toHaveAttribute(
        "data-testid",
        "settings-app-bar",
      );
      expect(settingsBtns[0]).toBeVisible();
    });
  });
  describe("audioOutputSwitcher", () => {
    it("is visible and can be clicked", async () => {
      const user = userEvent.setup();
      const switchFn = vi.fn();
      // Create mediaDevices with a speaker and an earpiece available,
      // with the speaker currently selected.
      // This is needed so that the audio switcher button is visible
      const available$ = new BehaviorSubject(
        new Map<string, { type: "speaker" } | { type: "earpiece" }>([
          ["speaker-id", { type: "speaker" }],
          ["earpiece-id", { type: "earpiece" }],
        ]),
      );
      const selected$ = new BehaviorSubject<
        { id: string; virtualEarpiece: boolean } | undefined
      >({ id: "speaker-id", virtualEarpiece: false });

      const mediaDevices = mockMediaDevices({
        audioOutput: {
          available$,
          selected$,
          select: switchFn,
        },
      });

      const { getByRole } = createInCallView({ mediaDevices });
      // The button should be visible. When current output is "speaker",
      // the switcher targets "earpiece", so the tooltip label is "Handset".
      const audioOutputBtn = getByRole("switch", { name: "Handset" });
      expect(audioOutputBtn).toBeVisible();

      await user.click(audioOutputBtn);

      // Clicking the button should call select -> switchFn with the earpiece device id
      expect(switchFn).toHaveBeenCalledWith("earpiece-id");
    });
  });
});
