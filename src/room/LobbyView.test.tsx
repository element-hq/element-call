/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { of } from "rxjs";
import { LeaveToHomeProvider } from "../LeaveToHomeContext";
import { TooltipProvider } from "@vector-im/compound-web";
import { type MatrixClient } from "matrix-js-sdk";
import { axe } from "vitest-axe";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { LobbyView } from "./LobbyView";
import { E2eeType } from "../e2ee/e2eeType";
import { mockMediaDevices, mockMuteStates } from "../utils/test";
import { type MediaDevices } from "../state/MediaDevices";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { type ProcessorState } from "../livekit/TrackProcessorContext";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import lobbyStyles from "./LobbyView.module.css";
import headerStyles from "../Header.module.css";
import { AppBar } from "../AppBar";

// Somewhere to go home to, so that the lobby offers the way back
const leaveToHome = vi.fn();

vi.mock("@livekit/components-react", () => ({
  usePreviewTracks: (): unknown[] => [],
}));

vi.mock("../livekit/TrackProcessorContext", () => ({
  useTrackProcessor: (): ProcessorState => ({
    supported: false,
    processor: undefined,
  }),
  useTrackProcessorSync: (): void => {},
  useBackgroundProcessing: (): { settling: boolean } => ({ settling: false }),
  useAddedBackgrounds: (): {
    added: [];
    addBackground: () => Promise<void>;
    removeBackground: () => Promise<void>;
  } => ({
    added: [],
    addBackground: async (): Promise<void> => {},
    removeBackground: async (): Promise<void> => {},
  }),
}));

vi.mock("react-use-measure", () => ({
  default: (): [() => void, object] => [(): void => {}, {}],
}));

vi.mock("../settings/SettingsModal", () => ({
  SettingsModal: (): null => null,
  defaultSettingsTab: "general",
}));

const mockClient = {
  getUserId: () => "@user:example.org",
  getDeviceId: () => "DEVICE",
} as Partial<MatrixClient> as MatrixClient;

const platformMock = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../Platform", () => ({
  get platform(): string {
    return platformMock();
  },
}));

const matrixInfo = {
  userId: "@user:example.org",
  displayName: "Test User",
  avatarUrl: "",
  roomId: "!room:example.org",
  roomName: "Test Room",
  roomAlias: null,
  roomAvatar: null,
  e2eeSystem: { kind: E2eeType.NONE } satisfies EncryptionSystem,
};

function renderLobbyView(
  props: Partial<Parameters<typeof LobbyView>[0]> = {},
  withAppBar = false,
  platform = "android",
  devices: Partial<MediaDevices> = {},
): ReturnType<typeof render> {
  platformMock.mockReturnValue(platform);
  const mediaDevices = mockMediaDevices(devices);
  const muteStates = mockMuteStates();
  const hideHeader = withAppBar ? true : false;
  const lobbyView = (
    <LobbyView
      client={mockClient}
      matrixInfo={matrixInfo}
      muteStates={muteStates}
      onEnter={() => {}}
      confineToRoom={false}
      hideHeader={hideHeader}
      participantCount={3}
      onShareClick={null}
      {...props}
    />
  );
  return render(
    <LeaveToHomeProvider value={leaveToHome}>
      <MediaDevicesContext value={mediaDevices}>
        <TooltipProvider>
          {withAppBar && <AppBar>{lobbyView}</AppBar>}
          {!withAppBar && lobbyView}
        </TooltipProvider>
      </MediaDevicesContext>
    </LeaveToHomeProvider>,
  );
}

describe("LobbyView", () => {
  it("renders with header and participant count", async () => {
    const { container } = renderLobbyView();
    expect(container).toMatchSnapshot();
    expect(
      container.getElementsByClassName(headerStyles.header).length,
    ).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders without header", () => {
    const { container } = renderLobbyView({ hideHeader: true });
    const els = container.getElementsByClassName(headerStyles.header);
    for (const el of els) {
      expect(el).not.toBeVisible();
    }
  });

  it("renders with waiting for invite state", () => {
    const { getByTestId } = renderLobbyView({
      waitingForInvite: true,
    });
    expect(getByTestId("lobby_joinCall")).toHaveClass(lobbyStyles.wait);
  });

  it("renders with AppBar android", async () => {
    const { container, getByRole } = renderLobbyView(
      {
        waitingForInvite: true,
      },
      true,
      "android",
    );
    getByRole("banner");
    // Check that the primary button uses ArrowLeftIcon (the back/return icon),
    // not the default CollapseIcon
    const { container: iconContainer } = render(<ArrowLeftIcon />);
    const expectedSvgPath = iconContainer
      .querySelector("path")!
      .getAttribute("d");
    const primaryButtonSvgPath = container
      .querySelector("path")
      ?.getAttribute("d");
    expect(primaryButtonSvgPath).toBe(expectedSvgPath);
    expect(container).toMatchSnapshot();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders with AppBar ios", async () => {
    const { container, getByRole } = renderLobbyView(
      {
        waitingForInvite: true,
      },
      true,
      "ios",
    );
    getByRole("banner");
    // Check that the primary button uses ArrowLeftIcon (the back/return icon),
    // not the default CollapseIcon
    const { container: iconContainer } = render(<ChevronLeftIcon />);
    const expectedSvgPath = iconContainer
      .querySelector("path")!
      .getAttribute("d");
    const primaryButtonSvgPath = container
      .querySelector("path")
      ?.getAttribute("d");
    expect(primaryButtonSvgPath).toBe(expectedSvgPath);
    expect(container).toMatchSnapshot();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("LobbyView microphone level", () => {
  const realMediaDevices = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices",
  );

  afterEach(() => {
    vi.unstubAllGlobals();
    // Put navigator back, or every later test in the run inherits the stub.
    if (realMediaDevices === undefined) {
      Reflect.deleteProperty(navigator, "mediaDevices");
    } else {
      Object.defineProperty(navigator, "mediaDevices", realMediaDevices);
    }
  });

  /** Just enough of the Web Audio and capture APIs for the meter to run. */
  function stubAudioCapture(): void {
    vi.stubGlobal(
      "AudioContext",
      class {
        public readonly state = "running";
        public createAnalyser(): object {
          return {
            fftSize: 1024,
            getByteTimeDomainData: (): void => {},
          };
        }
        public createMediaStreamSource(): object {
          return { connect: (): void => {} };
        }
        public close(): void {}
      },
    );
    // Only this property: replacing navigator wholesale drops the getters on
    // its prototype, such as userAgent.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
      },
    });
  }

  it("shows the microphone level meter", async () => {
    stubAudioCapture();
    const user = userEvent.setup();
    const { getByRole } = renderLobbyView({}, false, "desktop", {
      requestDeviceNames: (): void => {},
      audioInput: {
        available$: of(
          new Map([["mic1", { type: "name", name: "Microphone 1" }]]),
        ),
        selected$: of({ id: "mic1" }),
        select: (): void => {},
      },
    } as unknown as Partial<MediaDevices>);

    // The meter lives with the microphone picker, which the pre-join screen
    // reaches through the same chevron as a call in progress.
    await user.click(getByRole("button", { name: "Microphone" }));

    expect(
      await screen.findByRole("meter", { name: "Microphone level" }),
    ).toBeInTheDocument();
  });
});
