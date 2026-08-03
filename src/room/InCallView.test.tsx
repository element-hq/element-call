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
import { BrowserRouter } from "react-router-dom";
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
import {
  type CallViewModel,
  type CallViewModelOptions,
} from "../state/CallViewModel/CallViewModel";
import { alice, local } from "../utils/test-fixtures";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";
import { LivekitRoomAudioRenderer } from "../livekit/MatrixAudioRenderer";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type MediaDevices as ECMediaDevices } from "../state/MediaDevices";
import { AppBar } from "../AppBar";
import { initializeWidget } from "../widget";

initializeWidget();
vi.hoisted(
  () =>
    // Use globalThis rather than global because vite-plugin-node-polyfills seems
    // to rewrite global into an import which then interferes with vitest's hoisting
    // which runs before imports.
    (globalThis.ImageData = class MockImageData {
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
  /** If true, wraps the rendered tree in an AppBar provider */
  withAppBar?: boolean;
}
function createInCallView(args: CreateInCallViewArgs = {}): RenderResult & {
  rtcSession: MockRTCSession;
  vm: CallViewModel;
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
  const { vm, footerVm, rtcSession } = getBasicCallViewModelEnvironment(
    [local, alice],
    undefined,
    mediaDevices,
    args.callViewModelOptions,
  );

  rtcSession.joined = true;
  const room = rtcSession.room;
  const client = room.client;

  const inCallView = (
    <InCallView
      client={client}
      rtcSession={rtcSession.asMockedSession()}
      muteStates={muteState}
      vm={vm}
      footerVm={footerVm}
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
    <BrowserRouter>
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
    </BrowserRouter>,
  );
  return {
    ...renderResult,
    rtcSession,
    vm,
  };
}

describe("InCallView", () => {
  describe("rendering", () => {
    it("renders", () => {
      const { container } = createInCallView();
      expect(container).toMatchSnapshot();
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
      const selected$ = new BehaviorSubject({
        id: "speaker-id",
        virtualEarpiece: false,
      });

      const mediaDevices = mockMediaDevices({
        audioOutput: {
          available$,
          selected$,
          select: switchFn,
        },
      });

      const { getByRole } = createInCallView({ mediaDevices });
      // The button should be visible. When current output is "speaker",
      const audioOutputBtn = getByRole("button", { name: "Loudspeaker" });
      expect(audioOutputBtn).toBeVisible();

      await user.click(audioOutputBtn);

      // Clicking the button should call select -> switchFn with the earpiece device id
      expect(switchFn).toHaveBeenCalledWith("earpiece-id");
    });
  });
});
