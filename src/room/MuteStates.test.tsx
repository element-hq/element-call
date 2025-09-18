/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { type FC, useCallback, useState } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { createMediaDeviceObserver } from "@livekit/components-core";
import { of } from "rxjs";

import { useMuteStates } from "./MuteStates";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { mockConfig } from "../utils/test";
import { MediaDevices } from "../state/MediaDevices";
import { ObservableScope } from "../state/ObservableScope";
vi.mock("@livekit/components-core");

interface TestComponentProps {
  isJoined?: boolean;
}

const TestComponent: FC<TestComponentProps> = ({ isJoined = false }) => {
  const muteStates = useMuteStates(isJoined);
  const onToggleAudio = useCallback(
    () => muteStates.audio.setEnabled?.(!muteStates.audio.enabled),
    [muteStates],
  );
  return (
    <div>
      <div data-testid="audio-enabled">
        {muteStates.audio.enabled.toString()}
      </div>
      <button onClick={onToggleAudio}>Toggle audio</button>
      <div data-testid="video-enabled">
        {muteStates.video.enabled.toString()}
      </div>
    </div>
  );
};

const mockMicrophone: MediaDeviceInfo = {
  deviceId: "",
  kind: "audioinput",
  label: "",
  groupId: "",
  toJSON() {
    return {};
  },
};

const mockSpeaker: MediaDeviceInfo = {
  deviceId: "",
  kind: "audiooutput",
  label: "",
  groupId: "",
  toJSON() {
    return {};
  },
};

const mockCamera: MediaDeviceInfo = {
  deviceId: "",
  kind: "videoinput",
  label: "",
  groupId: "",
  toJSON() {
    return {};
  },
};

function mockMediaDevices(
  {
    microphone,
    speaker,
    camera,
  }: {
    microphone?: boolean;
    speaker?: boolean;
    camera?: boolean;
  } = { microphone: true, speaker: true, camera: true },
): MediaDevices {
  vi.mocked(createMediaDeviceObserver).mockImplementation((kind) => {
    switch (kind) {
      case "audioinput":
        return of(microphone ? [mockMicrophone] : []);
      case "audiooutput":
        return of(speaker ? [mockSpeaker] : []);
      case "videoinput":
        return of(camera ? [mockCamera] : []);
      case undefined:
        throw new Error("Unimplemented");
    }
  });
  const scope = new ObservableScope();
  onTestFinished(() => scope.end());
  return new MediaDevices(scope);
}

describe("useMuteStates VITE_PACKAGE='full' (SPA) mode", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_PACKAGE", "full");
  });

  afterAll(() => {
    vi.resetAllMocks();
  });

  it("disabled when no input devices", () => {
    mockConfig();

    render(
      <MemoryRouter>
        <MediaDevicesContext
          value={mockMediaDevices({
            microphone: false,
            camera: false,
          })}
        >
          <TestComponent />
        </MediaDevicesContext>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("false");
  });

  it("enables devices by default in the lobby", () => {
    mockConfig();

    render(
      <MemoryRouter>
        <MediaDevicesContext value={mockMediaDevices()}>
          <TestComponent />
        </MediaDevicesContext>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("true");
    expect(screen.getByTestId("video-enabled").textContent).toBe("true");
  });

  it("disables devices by default in the call", () => {
    // Disabling new devices in the call ensures that connecting a webcam
    // mid-call won't cause it to suddenly be enabled without user input
    mockConfig();

    render(
      <MemoryRouter>
        <MediaDevicesContext value={mockMediaDevices()}>
          <TestComponent isJoined />
        </MediaDevicesContext>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("false");
  });

  it("uses defaults from config", () => {
    mockConfig({
      media_devices: {
        enable_audio: false,
        enable_video: false,
      },
    });

    render(
      <MemoryRouter>
        <MediaDevicesContext value={mockMediaDevices()}>
          <TestComponent />
        </MediaDevicesContext>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("false");
  });

  it("skipLobby mutes inputs", () => {
    mockConfig();

    render(
      <MemoryRouter
        initialEntries={[
          "/room/?skipLobby=true&widgetId=1234&parentUrl=www.parent.org",
        ]}
      >
        <MediaDevicesContext value={mockMediaDevices()}>
          <TestComponent />
        </MediaDevicesContext>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("false");
  });

  it("remembers previous state when devices disappear and reappear", async () => {
    const user = userEvent.setup();
    mockConfig();
    const noDevices = mockMediaDevices({ microphone: false, camera: false });
    // Warm up these Observables before making further changes to the
    // createMediaDevicesObserver mock
    noDevices.audioInput.available$.subscribe(() => {}).unsubscribe();
    noDevices.videoInput.available$.subscribe(() => {}).unsubscribe();
    const someDevices = mockMediaDevices();

    const ReappearanceTest: FC = () => {
      const [devices, setDevices] = useState(someDevices);
      const onConnectDevicesClick = useCallback(
        () => setDevices(someDevices),
        [],
      );
      const onDisconnectDevicesClick = useCallback(
        () => setDevices(noDevices),
        [],
      );

      return (
        <MemoryRouter>
          <MediaDevicesContext value={devices}>
            <TestComponent />
            <button onClick={onConnectDevicesClick}>Connect devices</button>
            <button onClick={onDisconnectDevicesClick}>
              Disconnect devices
            </button>
          </MediaDevicesContext>
        </MemoryRouter>
      );
    };

    render(<ReappearanceTest />);
    expect(screen.getByTestId("audio-enabled").textContent).toBe("true");
    expect(screen.getByTestId("video-enabled").textContent).toBe("true");
    await user.click(screen.getByRole("button", { name: "Toggle audio" }));
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("true");
    await user.click(
      screen.getByRole("button", { name: "Disconnect devices" }),
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("false");
    await user.click(screen.getByRole("button", { name: "Connect devices" }));
    // Audio should remember that it was muted, while video should re-enable
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("true");
  });
});

describe("useMuteStates in VITE_PACKAGE='embedded' (widget) mode", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_PACKAGE", "embedded");
  });

  it("uses defaults from config", () => {
    mockConfig({
      media_devices: {
        enable_audio: false,
        enable_video: false,
      },
    });

    render(
      <MemoryRouter>
        <MediaDevicesContext value={mockMediaDevices()}>
          <TestComponent />
        </MediaDevicesContext>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("false");
  });

  it("skipLobby does not mute inputs", () => {
    mockConfig();

    render(
      <MemoryRouter
        initialEntries={[
          "/room/?skipLobby=true&widgetId=1234&parentUrl=www.parent.org",
        ]}
      >
        <MediaDevicesContext value={mockMediaDevices()}>
          <TestComponent />
        </MediaDevicesContext>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("true");
    expect(screen.getByTestId("video-enabled").textContent).toBe("true");
  });

  it("url params win over config", () => {
    // The config sets audio and video to disabled
    mockConfig({ media_devices: { enable_audio: false, enable_video: false } });

    render(
      <MemoryRouter
        initialEntries={[
          // The Intent sets both audio and video enabled to true via the url param configuration
          "/room/?intent=start_call_dm&widgetId=1234&parentUrl=www.parent.org",
        ]}
      >
        <MediaDevicesContext value={mockMediaDevices()}>
          <TestComponent />
        </MediaDevicesContext>
      </MemoryRouter>,
    );
    // At the end we expect the url param to take precedence, resulting in true
    expect(screen.getByTestId("audio-enabled").textContent).toBe("true");
    expect(screen.getByTestId("video-enabled").textContent).toBe("true");
  });
});
