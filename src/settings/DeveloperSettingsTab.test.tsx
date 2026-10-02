/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";

import type { MatrixClient } from "matrix-js-sdk";
import {
  DeveloperSettingsTab,
  type DeveloperSettingsSnapshot,
  type TransportInfo,
} from "./DeveloperSettingsTab";
import { outOfCallDeveloperSettingsTabViewModel } from "./DeveloperSettingsTabViewModel";
import { createStaticViewModel } from "../state/ViewModel";
import {
  customLivekitUrl as customLivekitUrlSetting,
  enableExtendedLivekitLogs as enableExtendedLivekitLogsSetting,
  matrixRTCMode as matrixRTCModeSetting,
} from "./settings";
import {
  authenticateWithTransport,
  constant,
  MatrixRTCMode,
} from "@element-hq/matrixrtc-sdk";
import type * as MatrixRTCSdk from "@element-hq/matrixrtc-sdk";
import { mockConfig } from "../utils/test";

// Mock url params hook to avoid environment-dependent snapshot churn.
vi.mock("../UrlParams", () => ({
  useUrlParams: (): { mocked: boolean; answer: number } => ({
    mocked: true,
    answer: 42,
  }),
}));

// IMPORTANT: mock the same specifier used by DeveloperSettingsTab
vi.mock("@element-hq/matrixrtc-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof MatrixRTCSdk>()),
  authenticateWithTransport: vi.fn().mockResolvedValue({
    url: "mock-url",
    jwt: "mock-jwt",
  }),
}));

/** A transport the panel shows, as the client would hand it out. */
function mockTransport(
  url: string,
  local: boolean,
  resolved?: { url: string; roomAlias: string; identity: string },
): TransportInfo {
  return {
    local,
    transport: {
      type: "livekit",
      id: url,
      raw: { type: "livekit", livekit_service_url: url },
      resolved$: constant(
        resolved && { type: "livekit", token: "secret", ...resolved },
      ),
    },
  };
}

// Minimal MatrixClient mock with only the methods used by the component.
function createMockMatrixClient(): MatrixClient {
  return {
    doesServerSupportUnstableFeature: vi.fn().mockResolvedValue(true), // ensure stickyEventsSupported eventually becomes true
    getCrypto: (): { getVersion: () => string } | undefined => ({
      getVersion: () => "crypto-1.0.0",
    }),
    getUserId: () => "@alice:example.org",
    getDeviceId: () => "DEVICE123",
  } as unknown as MatrixClient;
}

describe("DeveloperSettingsTab", () => {
  it("renders and matches snapshot", async () => {
    const client = createMockMatrixClient();

    const transports = [
      mockTransport("https://local-sfu.example.org/jwt", true, {
        url: "wss://local-sfu.example.org",
        roomAlias: "TestAlias",
        identity: "localParticipantIdentity",
      }),
      mockTransport("https://remote-sfu.example.org/jwt", false),
    ];

    const { container } = render(
      <DeveloperSettingsTab
        client={client}
        roomId={"#room:example.org"}
        transports={transports}
        env={{ MY_MOCK_ENV: 10, ENV: "test" } as unknown as ImportMetaEnv}
        vm={outOfCallDeveloperSettingsTabViewModel}
      />,
    );

    // Wait for the async sticky events feature check to resolve so the final UI
    // (e.g. enabled Matrix_2_0 radio button) appears deterministically.
    await waitFor(() =>
      expect(client.doesServerSupportUnstableFeature).toHaveBeenCalled(),
    );

    expect(container).toMatchSnapshot();
  });
  describe("custom livekit url", () => {
    afterEach(() => {
      customLivekitUrlSetting.setValue(null);
    });
    const client = {
      doesServerSupportUnstableFeature: vi.fn().mockResolvedValue(true),
      getCrypto: () => ({ getVersion: (): string => "x" }),
      getUserId: () => "@u:hs",
      getDeviceId: () => "DEVICE",
    } as unknown as MatrixClient;
    it("will not update custom livekit url without roomId", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            env={{} as unknown as ImportMetaEnv}
            vm={outOfCallDeveloperSettingsTabViewModel}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);
      await user.type(input, "wss://example.livekit.invalid");

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);
      expect(authenticateWithTransport).not.toHaveBeenCalled();

      expect(customLivekitUrlSetting.getValue()).toBe(null);
    });
    it("will not update custom livekit url without text in input", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            roomId="#testRoom"
            env={{} as unknown as ImportMetaEnv}
            vm={outOfCallDeveloperSettingsTabViewModel}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);
      expect(authenticateWithTransport).not.toHaveBeenCalled();

      expect(customLivekitUrlSetting.getValue()).toBe(null);
    });
    it("will not update custom livekit url when pressing cancel", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            roomId="#testRoom"
            env={{} as unknown as ImportMetaEnv}
            vm={outOfCallDeveloperSettingsTabViewModel}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);
      await user.type(input, "wss://example.livekit.invalid");

      const cancelButton = screen.getByRole("button", {
        name: "Reset overwrite",
      });
      await user.click(cancelButton);
      expect(authenticateWithTransport).not.toHaveBeenCalled();

      expect(customLivekitUrlSetting.getValue()).toBe(null);
    });
    it("will update custom livekit url", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            roomId="#testRoom"
            env={{} as unknown as ImportMetaEnv}
            vm={outOfCallDeveloperSettingsTabViewModel}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);
      await user.type(input, "wss://example.livekit.valid");

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);
      expect(authenticateWithTransport).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "wss://example.livekit.valid",
        "#testRoom",
      );

      expect(customLivekitUrlSetting.getValue()).toBe(
        "wss://example.livekit.valid",
      );
    });
    it("will show error on invalid url", async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            roomId="#testRoom"
            env={{} as unknown as ImportMetaEnv}
            vm={outOfCallDeveloperSettingsTabViewModel}
          />
        </TooltipProvider>,
      );

      const input = screen.getByLabelText("Custom Livekit-url");
      await user.clear(input);
      await user.type(input, "wss://example.livekit.valid");

      const saveButton = screen.getByRole("button", { name: "Save" });
      (authenticateWithTransport as Mock).mockImplementation(() => {
        throw new Error("Invalid URL");
      });
      await user.click(saveButton);
      expect(
        screen.getByText("invalid URL (did not update)"),
      ).toBeInTheDocument();
      expect(customLivekitUrlSetting.getValue()).toBe(null);
    });
  });

  // Add this test inside the describe("DeveloperSettingsTab", () => { block,
  // after the custom livekit url tests:

  describe("enable extended livekit logs", () => {
    afterEach(() => {
      enableExtendedLivekitLogsSetting.setValue(false);
    });

    it("toggles extended livekit logs setting", async () => {
      const user = userEvent.setup();
      const client = createMockMatrixClient();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            env={{} as unknown as ImportMetaEnv}
            vm={outOfCallDeveloperSettingsTabViewModel}
          />
        </TooltipProvider>,
      );

      const checkbox = screen.getByLabelText("Enable extended livekit logs");

      // Initial state should be unchecked (default false)
      expect(checkbox).not.toBeChecked();
      expect(enableExtendedLivekitLogsSetting.getValue()).toBe(false);

      // Click to enable
      await user.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(enableExtendedLivekitLogsSetting.getValue()).toBe(true);

      // Click to disable
      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
      expect(enableExtendedLivekitLogsSetting.getValue()).toBe(false);
    });

    it("Use the current setting value on render", () => {
      const client = createMockMatrixClient();

      // Set the value to true before rendering
      enableExtendedLivekitLogsSetting.setValue(true);

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            env={{} as unknown as ImportMetaEnv}
            vm={outOfCallDeveloperSettingsTabViewModel}
          />
        </TooltipProvider>,
      );

      const checkbox = screen.getByLabelText("Enable extended livekit logs");
      expect(checkbox).toBeChecked();
      expect(enableExtendedLivekitLogsSetting.getValue()).toBe(true);
    });
  });

  describe("matrix rtc mode", () => {
    afterEach(() => {
      matrixRTCModeSetting.setValue(MatrixRTCMode.Compatibility);
      vi.restoreAllMocks();
    });

    function getModeRadios(): {
      compatibility: HTMLInputElement;
      matrix20: HTMLInputElement;
    } {
      return {
        compatibility: screen.getByDisplayValue(
          MatrixRTCMode.Compatibility,
        ) as HTMLInputElement,
        matrix20: screen.getByDisplayValue(
          MatrixRTCMode.Matrix_2_0,
        ) as HTMLInputElement,
      };
    }

    it("radios reflect the localStorage setting when config does not force the mode", async () => {
      mockConfig({});
      matrixRTCModeSetting.setValue(MatrixRTCMode.Compatibility);
      const client = createMockMatrixClient();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            env={{} as unknown as ImportMetaEnv}
            vm={outOfCallDeveloperSettingsTabViewModel}
          />
        </TooltipProvider>,
      );

      await waitFor(() =>
        expect(client.doesServerSupportUnstableFeature).toHaveBeenCalled(),
      );

      const radios = getModeRadios();
      expect(radios.compatibility).toBeChecked();
      expect(radios.matrix20).not.toBeChecked();
      // None are disabled by config; only Matrix_2_0 may be disabled by sticky-events support.
      expect(radios.compatibility).not.toBeDisabled();
    });

    it.each([MatrixRTCMode.Compatibility, MatrixRTCMode.Matrix_2_0])(
      "disables all radios and shows the config value (%s) as checked when matrix_rtc_mode is set",
      async (configMode) => {
        mockConfig({ matrix_rtc_mode: configMode });
        // Local setting is intentionally different from the config value to
        // prove config wins.
        matrixRTCModeSetting.setValue(
          configMode === MatrixRTCMode.Compatibility
            ? MatrixRTCMode.Matrix_2_0
            : MatrixRTCMode.Compatibility,
        );
        const client = createMockMatrixClient();

        render(
          <TooltipProvider>
            <DeveloperSettingsTab
              client={client}
              env={{} as unknown as ImportMetaEnv}
              vm={outOfCallDeveloperSettingsTabViewModel}
            />
          </TooltipProvider>,
        );

        await waitFor(() =>
          expect(client.doesServerSupportUnstableFeature).toHaveBeenCalled(),
        );

        const radios = getModeRadios();
        expect(radios.compatibility).toBeDisabled();
        expect(radios.matrix20).toBeDisabled();

        const checkedValue = (
          {
            [MatrixRTCMode.Compatibility]: radios.compatibility,
            [MatrixRTCMode.Matrix_2_0]: radios.matrix20,
          } as const
        )[configMode];
        expect(checkedValue).toBeChecked();
      },
    );
  });

  describe("KeyRotationStatus", () => {
    it("displays active status when key rotation is not suppressed", async () => {
      const client = createMockMatrixClient();
      const vm = createStaticViewModel<DeveloperSettingsSnapshot>({
        keyRotation: { suppressed: false, participantCount: 5 },
      });

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            env={{} as unknown as ImportMetaEnv}
            vm={vm}
          />
        </TooltipProvider>,
      );

      await waitFor(() =>
        expect(
          screen.getByText(/Media key rotation: active \(5 participants\)/),
        ).toBeInTheDocument(),
      );
    });

    it("displays suppressed status when key rotation is suppressed", async () => {
      const client = createMockMatrixClient();
      const vm = createStaticViewModel<DeveloperSettingsSnapshot>({
        keyRotation: { suppressed: true, participantCount: 50 },
      });

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            env={{} as unknown as ImportMetaEnv}
            vm={vm}
          />
        </TooltipProvider>,
      );

      await waitFor(() =>
        expect(
          screen.getByText(
            /Media key rotation: suppressed, participant limit reached \(50 participants\)/,
          ),
        ).toBeInTheDocument(),
      );
    });

    it("does not render KeyRotationStatus when not in a call", async () => {
      const client = createMockMatrixClient();

      render(
        <TooltipProvider>
          <DeveloperSettingsTab
            client={client}
            env={{} as unknown as ImportMetaEnv}
            vm={outOfCallDeveloperSettingsTabViewModel}
          />
        </TooltipProvider>,
      );

      await waitFor(() =>
        expect(
          screen.queryByText(/Media key rotation:/),
        ).not.toBeInTheDocument(),
      );
    });
  });
});
