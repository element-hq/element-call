/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { type FC, useCallback, useState } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import { useMuteStates } from "./MuteStates";
import {
  type DeviceLabel,
  type MediaDevice,
  type MediaDevices,
  MediaDevicesContext,
} from "../livekit/MediaDevicesContext";
import { mockConfig } from "../utils/test";

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

function mockDevices(available: Map<string, DeviceLabel>): MediaDevice {
  return {
    available,
    selectedId: "",
    selectedGroupId: "",
    select: (): void => {},
  };
}

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
  return {
    audioInput: mockDevices(
      microphone
        ? new Map([[mockMicrophone.deviceId, mockMicrophone]])
        : new Map(),
    ),
    audioOutput: mockDevices(
      speaker ? new Map([[mockSpeaker.deviceId, mockSpeaker]]) : new Map(),
    ),
    videoInput: mockDevices(
      camera ? new Map([[mockCamera.deviceId, mockCamera]]) : new Map(),
    ),
    startUsingDeviceNames: (): void => {},
    stopUsingDeviceNames: (): void => {},
  };
}

describe("useMuteStates", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.resetAllMocks();
  });

  it("disabled when no input devices", () => {
    mockConfig();

    render(
      <MemoryRouter>
        <MediaDevicesContext.Provider
          value={mockMediaDevices({
            microphone: false,
            camera: false,
          })}
        >
          <TestComponent />
        </MediaDevicesContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("false");
  });

  it("enables devices by default in the lobby", () => {
    mockConfig();

    render(
      <MemoryRouter>
        <MediaDevicesContext.Provider value={mockMediaDevices()}>
          <TestComponent />
        </MediaDevicesContext.Provider>
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
        <MediaDevicesContext.Provider value={mockMediaDevices()}>
          <TestComponent isJoined />
        </MediaDevicesContext.Provider>
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
        <MediaDevicesContext.Provider value={mockMediaDevices()}>
          <TestComponent />
        </MediaDevicesContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("false");
  });

  it("skipLobby mutes inputs", () => {
    mockConfig();

    render(
      <MemoryRouter initialEntries={["/room/?skipLobby=true"]}>
        <MediaDevicesContext.Provider value={mockMediaDevices()}>
          <TestComponent />
        </MediaDevicesContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("audio-enabled").textContent).toBe("false");
    expect(screen.getByTestId("video-enabled").textContent).toBe("false");
  });

  it("remembers previous state when devices disappear and reappear", async () => {
    const user = userEvent.setup();
    mockConfig();
    const noDevices = mockMediaDevices({ microphone: false, camera: false });
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
          <MediaDevicesContext.Provider value={devices}>
            <TestComponent />
            <button onClick={onConnectDevicesClick}>Connect devices</button>
            <button onClick={onDisconnectDevicesClick}>
              Disconnect devices
            </button>
          </MediaDevicesContext.Provider>
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
