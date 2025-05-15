/*
Copyright 2025 New Vector Ltd.

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
import { act, render, type RenderResult } from "@testing-library/react";
import { type MatrixClient, JoinRule, type RoomState } from "matrix-js-sdk";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { type RelationsContainer } from "matrix-js-sdk/lib/models/relations-container";
import { ConnectionState, type LocalParticipant } from "livekit-client";
import { of } from "rxjs";
import { BrowserRouter } from "react-router-dom";
import { TooltipProvider } from "@vector-im/compound-web";
import { RoomContext, useLocalParticipant } from "@livekit/components-react";
import { RoomAndToDeviceEvents } from "matrix-js-sdk/lib/matrixrtc/RoomAndToDeviceKeyTransport";

import { type MuteStates } from "./MuteStates";
import { InCallView } from "./InCallView";
import {
  mockLivekitRoom,
  mockLocalParticipant,
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockRemoteParticipant,
  mockRtcMembership,
  type MockRTCSession,
} from "../utils/test";
import { E2eeType } from "../e2ee/e2eeType";
import { getBasicCallViewModelEnvironment } from "../utils/test-viewmodel";
import { alice, local } from "../utils/test-fixtures";
import {
  developerMode as developerModeSetting,
  useExperimentalToDeviceTransport as useExperimentalToDeviceTransportSetting,
} from "../settings/settings";
import { ReactionsSenderProvider } from "../reactions/useReactionsSender";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";
import { MatrixAudioRenderer } from "../livekit/MatrixAudioRenderer";

// vi.hoisted(() => {
//   localStorage = {} as unknown as Storage;
// });
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
const carol = mockMatrixRoomMember(localRtcMember);
const roomMembers = new Map([carol].map((p) => [p.userId, p]));

const roomId = "!foo:bar";
let useRoomEncryptionSystemMock: MockedFunction<typeof useRoomEncryptionSystem>;

beforeEach(() => {
  vi.clearAllMocks();

  // MatrixAudioRenderer is tested separately.
  (
    MatrixAudioRenderer as MockedFunction<typeof MatrixAudioRenderer>
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

function createInCallView(): RenderResult & {
  rtcSession: MockRTCSession;
} {
  const client = {
    getUser: () => null,
    getUserId: () => localRtcMember.sender,
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
    hasEncryptionStateEvent: vi.fn().mockReturnValue(true),
    getCanonicalAlias: () => null,
    currentState: {
      getJoinRule: () => JoinRule.Invite,
    } as Partial<RoomState> as RoomState,
  });

  const muteState = {
    audio: { enabled: false },
    video: { enabled: false },
  } as MuteStates;
  const livekitRoom = mockLivekitRoom(
    {
      localParticipant,
    },
    {
      remoteParticipants$: of([remoteParticipant]),
    },
  );
  const { vm, rtcSession } = getBasicCallViewModelEnvironment([local, alice]);

  rtcSession.joined = true;
  const renderResult = render(
    <BrowserRouter>
      <ReactionsSenderProvider
        vm={vm}
        rtcSession={rtcSession as unknown as MatrixRTCSession}
      >
        <TooltipProvider>
          <RoomContext.Provider value={livekitRoom}>
            <InCallView
              client={client}
              hideHeader={true}
              rtcSession={rtcSession as unknown as MatrixRTCSession}
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
              livekitRoom={livekitRoom}
              participantCount={0}
              onLeave={function (): void {
                throw new Error("Function not implemented.");
              }}
              connState={ConnectionState.Connected}
              onShareClick={null}
            />
          </RoomContext.Provider>
        </TooltipProvider>
      </ReactionsSenderProvider>
    </BrowserRouter>,
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
  describe("toDevice label", () => {
    it("is shown if setting activated and room encrypted", () => {
      useRoomEncryptionSystemMock.mockReturnValue({
        kind: E2eeType.PER_PARTICIPANT,
      });
      useExperimentalToDeviceTransportSetting.setValue(true);
      developerModeSetting.setValue(true);
      const { getByText } = createInCallView();
      expect(getByText("using to Device key transport")).toBeInTheDocument();
    });

    it("is not shown in unenecrypted room", () => {
      useRoomEncryptionSystemMock.mockReturnValue({
        kind: E2eeType.NONE,
      });
      useExperimentalToDeviceTransportSetting.setValue(true);
      developerModeSetting.setValue(true);
      const { queryByText } = createInCallView();
      expect(
        queryByText("using to Device key transport"),
      ).not.toBeInTheDocument();
    });

    it("is hidden once fallback was triggered", async () => {
      useRoomEncryptionSystemMock.mockReturnValue({
        kind: E2eeType.PER_PARTICIPANT,
      });
      useExperimentalToDeviceTransportSetting.setValue(true);
      developerModeSetting.setValue(true);
      const { rtcSession, queryByText } = createInCallView();
      expect(queryByText("using to Device key transport")).toBeInTheDocument();
      expect(rtcSession).toBeDefined();
      await act(() =>
        rtcSession.emit(RoomAndToDeviceEvents.EnabledTransportsChanged, {
          toDevice: true,
          room: true,
        }),
      );
      expect(
        queryByText("using to Device key transport"),
      ).not.toBeInTheDocument();
    });
    it("is not shown if setting is disabled", () => {
      useExperimentalToDeviceTransportSetting.setValue(false);
      developerModeSetting.setValue(true);
      useRoomEncryptionSystemMock.mockReturnValue({
        kind: E2eeType.PER_PARTICIPANT,
      });
      const { queryByText } = createInCallView();
      expect(
        queryByText("using to Device key transport"),
      ).not.toBeInTheDocument();
    });
    it("is not shown if developer mode is disabled", () => {
      useExperimentalToDeviceTransportSetting.setValue(true);
      developerModeSetting.setValue(false);
      useRoomEncryptionSystemMock.mockReturnValue({
        kind: E2eeType.PER_PARTICIPANT,
      });
      const { queryByText } = createInCallView();
      expect(
        queryByText("using to Device key transport"),
      ).not.toBeInTheDocument();
    });
  });
});
