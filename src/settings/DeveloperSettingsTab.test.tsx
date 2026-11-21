/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
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
  customTransport as customTransportSetting,
  enableExtendedLivekitLogs as enableExtendedLivekitLogsSetting,
  matrixRTCMode as matrixRTCModeSetting,
} from "./settings";
import {
  authenticateWithTransport,
  constant,
  MatrixRTCMode,
} from "@element-hq/matrixrtc-sdk";
import type * as MatrixRTCSdk from "@element-hq/matrixrtc-sdk";
import { exampleTransport, mockConfig } from "../utils/test";
import { GroupCallErrorBoundary } from "../room/GroupCallErrorBoundary";
import { LeaveToHomeProvider } from "../LeaveToHomeContext";
import { ElementCallError, ErrorCode } from "../utils/errors";

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

/**
 * Types the JSON representation of an object into the given element.
 */
async function typeJson(
  user: UserEvent,
  element: Element,
  object: object,
): Promise<void> {
  // `user.type` requires us to escape brackets by doubling them
  await user.type(
    element,
    JSON.stringify(object).replace(/([{[\]])/g, (c) => c + c),
  );
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
  describe("custom transport", () => {
    afterEach(() => {
      customTransportSetting.setValue(null);
    });
    const client = {
      doesServerSupportUnstableFeature: vi.fn().mockResolvedValue(true),
      getCrypto: () => ({ getVersion: (): string => "x" }),
      getUserId: () => "@u:hs",
      getDeviceId: () => "DEVICE",
      getDomain: () => "hs",
    } as unknown as MatrixClient;
    it("will not update custom transport without roomId", async () => {
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

      const input = screen.getByLabelText("Custom transport JSON");
      await user.clear(input);
      await typeJson(user, input, exampleTransport);

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);
      expect(authenticateWithTransport).not.toHaveBeenCalled();

      expect(customTransportSetting.getValue()).toBe(null);
    });
    it("will not update custom transport without text in input", async () => {
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

      const input = screen.getByLabelText("Custom transport JSON");
      await user.clear(input);

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);
      expect(authenticateWithTransport).not.toHaveBeenCalled();

      expect(customTransportSetting.getValue()).toBe(null);
    });
    it("will not update custom transport when pressing cancel", async () => {
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

      const input = screen.getByLabelText("Custom transport JSON");
      await user.clear(input);
      await user.type(input, "wss://example.livekit.invalid");

      const cancelButton = screen.getByRole("button", {
        name: "Reset overwrite",
      });
      await user.click(cancelButton);
      expect(authenticateWithTransport).not.toHaveBeenCalled();

      expect(customTransportSetting.getValue()).toBe(null);
    });
    it("will update custom transport", async () => {
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

      const input = screen.getByLabelText("Custom transport JSON");
      await user.clear(input);
      await typeJson(user, input, {
        type: "livekit",
        url: "wss://example.livekit.valid",
      });

      const saveButton = screen.getByRole("button", { name: "Save" });
      await user.click(saveButton);
      expect(authenticateWithTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: { type: "livekit", url: "wss://example.livekit.valid" },
          serverName: "hs",
          roomId: "#testRoom",
          role: "publisher",
        }),
      );

      expect(customTransportSetting.getValue()).toEqual({
        type: "livekit",
        url: "wss://example.livekit.valid",
      });
    });
    it("will show error on unreachable transport", async () => {
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

      const input = screen.getByLabelText("Custom transport JSON");
      await user.clear(input);
      await typeJson(user, input, {
        type: "livekit",
        url: "wss://example.livekit.valid",
      });

      const saveButton = screen.getByRole("button", { name: "Save" });
      (authenticateWithTransport as Mock).mockImplementation(() => {
        throw new Error("Failed to get SFU config");
      });
      await user.click(saveButton);
      expect(
        screen.getByText("invalid transport (did not update)"),
      ).toBeInTheDocument();
      expect(customTransportSetting.getValue()).toBe(null);
    });
  });

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
  describe("throw test error", () => {
    it("throws an ElementCallError that the error boundary shows", async () => {
      const user = userEvent.setup();
      const client = createMockMatrixClient();
      const onError = vi.fn();

      render(
        <LeaveToHomeProvider value={vi.fn()}>
          <GroupCallErrorBoundary
            onError={onError}
            recoveryActionHandler={vi.fn()}
          >
            <TooltipProvider>
              <DeveloperSettingsTab
                client={client}
                env={{} as unknown as ImportMetaEnv}
                vm={outOfCallDeveloperSettingsTabViewModel}
              />
            </TooltipProvider>
          </GroupCallErrorBoundary>
        </LeaveToHomeProvider>,
      );

      await user.click(
        screen.getByRole("button", { name: "Throw test error" }),
      );

      expect(await screen.findByText("Something went wrong")).toBeVisible();
      expect(onError).toHaveBeenCalledOnce();
      const error = onError.mock.calls[0][0] as unknown;
      expect(error).toBeInstanceOf(ElementCallError);
      expect((error as ElementCallError).code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});
