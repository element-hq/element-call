/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";

import type { MatrixClient } from "matrix-js-sdk";
import type { ReactNode } from "react";
import { SettingsModal } from "./SettingsModal";
import {
  rnnoiseNoiseSuppression,
  rnnoiseNoiseSuppressionPreset,
} from "./settings";
import { supportsRNNoiseProcessor } from "../audio/RNNoiseProcessor";

const { mockRequestDeviceNames } = vi.hoisted(() => ({
  mockRequestDeviceNames: vi.fn(),
}));

vi.mock("../audio/RNNoiseProcessor", async () => {
  const actual = await vi.importActual("../audio/RNNoiseProcessor");

  return {
    ...actual,
    supportsRNNoiseProcessor: vi.fn(() => true),
  };
});

vi.mock("../Modal", () => ({
  Modal: ({
    open,
    children,
  }: {
    open: boolean;
    children: ReactNode;
  }): ReactNode => (open ? <div>{children}</div> : null),
}));

vi.mock("../tabs/Tabs", () => ({
  TabContainer: ({
    tab,
    tabs,
  }: {
    tab: string;
    tabs: { key: string; content: ReactNode }[];
  }): ReactNode => (
    <div>{tabs.find((candidate) => candidate.key === tab)?.content}</div>
  ),
}));

vi.mock("../MediaDevicesContext", () => ({
  useMediaDevices: (): {
    requestDeviceNames: typeof mockRequestDeviceNames;
    audioInput: object;
    audioOutput: object;
    videoInput: object;
  } => ({
    requestDeviceNames: mockRequestDeviceNames,
    audioInput: {},
    audioOutput: {},
    videoInput: {},
  }),
}));

vi.mock("./DeviceSelection", () => ({
  DeviceSelection: (): ReactNode => <div data-testid="device-selection" />,
}));

vi.mock("../livekit/TrackProcessorContext", () => ({
  useTrackProcessor: (): { supported: boolean; processor: undefined } => ({
    supported: true,
    processor: undefined,
  }),
}));

vi.mock("./submit-rageshake", () => ({
  useSubmitRageshake: (): {
    submitRageshake: ReturnType<typeof vi.fn>;
    sending: boolean;
    sent: boolean;
    error: undefined;
    available: boolean;
  } => ({
    submitRageshake: vi.fn(),
    sending: false,
    sent: false,
    error: undefined,
    available: false,
  }),
}));

vi.mock("../UrlParams", async () => {
  const actual = await vi.importActual("../UrlParams");
  return {
    ...actual,
    useUrlParams: (): { controlledAudioDevices: boolean } => ({
      controlledAudioDevices: false,
    }),
  };
});

function renderSettingsModal(): void {
  render(
    <TooltipProvider>
      <SettingsModal
        open
        onDismiss={vi.fn()}
        tab="audio"
        onTabChange={vi.fn()}
        client={{} as MatrixClient}
      />
    </TooltipProvider>,
  );
}

describe("SettingsModal RNNoise controls", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        public observe(): void {}
        public unobserve(): void {}
        public disconnect(): void {}
      },
    );
    localStorage.clear();
    mockRequestDeviceNames.mockClear();
    rnnoiseNoiseSuppressionPreset.setValue("conservative");
    rnnoiseNoiseSuppression.setValue(false);
    vi.mocked(supportsRNNoiseProcessor).mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the RNNoise checkbox in the audio tab", () => {
    renderSettingsModal();

    expect(
      screen.getByLabelText("Enable enhanced noise suppression (RNNoise)"),
    ).toBeInTheDocument();
    expect(mockRequestDeviceNames).toHaveBeenCalledOnce();
  });

  it("disables RNNoise when AudioWorklet support is unavailable", () => {
    vi.mocked(supportsRNNoiseProcessor).mockReturnValue(false);

    renderSettingsModal();

    expect(
      screen.getByLabelText("Enable enhanced noise suppression (RNNoise)"),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "(Enhanced noise suppression is not supported by this browser.)",
      ),
    ).toBeInTheDocument();
  });

  it("persists RNNoise setting when toggled", async () => {
    const user = userEvent.setup();
    renderSettingsModal();

    const checkbox = screen.getByLabelText(
      "Enable enhanced noise suppression (RNNoise)",
    );
    await user.click(checkbox);

    expect(rnnoiseNoiseSuppression.getValue()).toBe(true);
    expect(
      localStorage.getItem("matrix-setting-rnnoise-noise-suppression"),
    ).toBe("true");
  });
});
