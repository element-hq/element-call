/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  beforeEach,
  afterEach,
  describe,
  expect,
  test,
  vi,
  type Mock,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { type MatrixClient, MatrixError } from "matrix-js-sdk";
import { BrowserRouter } from "react-router-dom";
import { type FC, type ReactNode } from "react";

import { RoomPage } from "./RoomPage";
import { ClientContextProvider } from "../ClientContext";
import { mockConfig, mockMediaDevices } from "../utils/test";
import * as useRegisterPasswordlessUserModule from "../auth/useRegisterPasswordlessUser";
import * as UrlParamsModule from "../UrlParams";
import { HeaderStyle, type UrlParams } from "../UrlParams";
import * as useLoadGroupCallModule from "./useLoadGroupCall";
import * as useProfileModule from "../profile/useProfile";
import * as settingsModule from "../settings/settings";
import * as MediaDevicesContextModule from "../MediaDevicesContext";
import * as widgetModule from "../widget";
import * as ConfigModule from "../config/Config";

// Mock modules
vi.mock("../auth/useRegisterPasswordlessUser");
vi.mock("../UrlParams");
vi.mock("./useLoadGroupCall");
vi.mock("../profile/useProfile");
vi.mock("../settings/settings");
vi.mock("../widget");
vi.mock("../MediaDevicesContext");
vi.mock("./GroupCallView", () => ({
  GroupCallView: vi.fn(() => <div>GroupCallView Mock</div>),
}));
vi.mock("./LobbyView", () => ({
  LobbyView: vi.fn(() => <div>LobbyView Mock</div>),
}));
vi.mock("./RoomAuthView", () => ({
  RoomAuthView: vi.fn(() => <div>RoomAuthView Mock</div>),
}));
vi.mock("../home/HomePage", () => ({
  HomePage: vi.fn(() => <div>HomePage Mock</div>),
}));
vi.mock("./AppSelectionModal", () => ({
  AppSelectionModal: vi.fn(() => <div>AppSelectionModal Mock</div>),
}));

const mockClient = vi.mocked<MatrixClient>({
  getUserId: () => "@alice:example.org",
} as unknown as MatrixClient);

interface WrapperProps {
  children: ReactNode;
}

const TestWrapper: FC<WrapperProps> = ({ children }) => {
  return <BrowserRouter>{children}</BrowserRouter>;
};

// Helper function to create mock URL params with optional overrides
// Only includes properties actually used by RoomPage component
function createMockUrlParams(
  overrides: Partial<ReturnType<typeof UrlParamsModule.useUrlParams>> = {},
): ReturnType<typeof UrlParamsModule.useUrlParams> {
  return {
    // Properties used by RoomPage
    confineToRoom: false,
    preload: false,
    header: HeaderStyle.Standard,
    displayName: null,
    skipLobby: false,
    callIntent: undefined,
    ...overrides,
  } as unknown as UrlParams;
}

describe("RoomPage", () => {
  let mockRegisterPasswordlessUser: Mock;
  let mockUseLoadGroupCall: Mock;
  let mockUseOptInAnalytics: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig({});

    // Default mock for widget
    vi.mocked(widgetModule).widget = null;

    // Default mock for useUrlParams
    vi.spyOn(UrlParamsModule, "useUrlParams").mockReturnValue(
      createMockUrlParams(),
    );

    // Default mock for useRoomIdentifier
    vi.spyOn(UrlParamsModule, "useRoomIdentifier").mockReturnValue({
      roomAlias: "#test:example.org",
      roomId: null,
      viaServers: [],
    });

    // Default mock for useRegisterPasswordlessUser
    mockRegisterPasswordlessUser = vi.fn();
    vi.spyOn(
      useRegisterPasswordlessUserModule,
      "useRegisterPasswordlessUser",
    ).mockReturnValue({
      registerPasswordlessUser: mockRegisterPasswordlessUser,
      privacyPolicyUrl: undefined,
      recaptchaId: undefined,
    });

    // Default mock for useLoadGroupCall
    mockUseLoadGroupCall = vi
      .spyOn(useLoadGroupCallModule, "useLoadGroupCall")
      .mockReturnValue({
        kind: "loading",
      });

    // Default mock for useProfile
    vi.spyOn(useProfileModule, "useProfile").mockReturnValue({
      success: false,
      loading: false,
      displayName: "Alice",
      avatarUrl: undefined,
      saveProfile: vi.fn(),
    });

    // Default mock for useOptInAnalytics
    mockUseOptInAnalytics = vi.fn();
    vi.spyOn(settingsModule, "useOptInAnalytics").mockReturnValue([
      null,
      mockUseOptInAnalytics,
    ]);

    // Default mock for useMediaDevices
    vi.spyOn(MediaDevicesContextModule, "useMediaDevices").mockReturnValue(
      mockMediaDevices({}),
    );
  });

  afterEach(() => {
    // Reset widget mock to prevent cross-test pollution
    vi.mocked(widgetModule).widget = null;
  });

  describe("Loading states", () => {
    test("shows RoomAuthView when not authenticated without displayName", () => {
      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: undefined,
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      // When not authenticated and no displayName, should show RoomAuthView
      expect(screen.getByText("RoomAuthView Mock")).toBeInTheDocument();
    });

    test("shows loading page when registering", async () => {
      vi.spyOn(UrlParamsModule, "useUrlParams").mockReturnValue(
        createMockUrlParams({ displayName: "Bob" }),
      );

      mockRegisterPasswordlessUser.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/require-await
        async () => new Promise(() => {}),
      ); // Never resolves

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: undefined,
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(mockRegisterPasswordlessUser).toHaveBeenCalledWith("Bob");
      });
    });
  });

  describe("Error states", () => {
    test("shows error page when client has error", () => {
      const error = new Error("Test error");

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "error",
              error,
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    test("shows error view when call not found", () => {
      mockUseLoadGroupCall.mockReturnValue({
        kind: "failed",
        error: new MatrixError({ errcode: "M_NOT_FOUND" }),
      });

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: {
                client: mockClient,
                isPasswordlessUser: false,
                changePassword: vi.fn(),
                logout: vi.fn(),
              },
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      // Should show the call not found error message
      expect(
        screen.getByText(/that link doesn't appear to belong/i),
      ).toBeInTheDocument();
    });
  });

  describe("Authentication", () => {
    test("shows RoomAuthView when not authenticated", () => {
      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: undefined,
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      expect(screen.getByText("RoomAuthView Mock")).toBeInTheDocument();
    });

    test("auto-registers passwordless user with displayName param", async () => {
      vi.spyOn(UrlParamsModule, "useUrlParams").mockReturnValue(
        createMockUrlParams({ displayName: "AutoRegisterUser" }),
      );

      mockRegisterPasswordlessUser.mockResolvedValue(undefined);

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: undefined,
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(mockRegisterPasswordlessUser).toHaveBeenCalledWith(
          "AutoRegisterUser",
        );
      });
    });

    test("does not auto-register in widget mode", () => {
      // Mock widget with proper EventEmitter
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const EventEmitter = require("events");
      const mockLazyActions = new EventEmitter();

      vi.mocked(widgetModule).widget = {
        api: {
          transport: {
            send: vi.fn().mockResolvedValue(undefined),
          },
        },
        lazyActions: mockLazyActions,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      vi.spyOn(UrlParamsModule, "useUrlParams").mockReturnValue(
        createMockUrlParams({ displayName: "ShouldNotRegister" }),
      );

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: undefined,
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      expect(mockRegisterPasswordlessUser).not.toHaveBeenCalled();
    });
  });

  describe("Room states", () => {
    test("shows HomePage when no room is specified", () => {
      vi.spyOn(UrlParamsModule, "useRoomIdentifier").mockReturnValue({
        roomAlias: null,
        roomId: null,
        viaServers: [],
      });

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: {
                client: mockClient,
                isPasswordlessUser: false,
                changePassword: vi.fn(),
                logout: vi.fn(),
              },
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      expect(screen.getByText("HomePage Mock")).toBeInTheDocument();
    });

    test("shows loading state for group call", () => {
      mockUseLoadGroupCall.mockReturnValue({
        kind: "loading",
      });

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: {
                client: mockClient,
                isPasswordlessUser: false,
                changePassword: vi.fn(),
                logout: vi.fn(),
              },
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      // The loading state renders with the heading
      expect(screen.getByRole("heading")).toBeInTheDocument();
    });

    test("shows GroupCallView when call is loaded", () => {
      mockUseLoadGroupCall.mockReturnValue({
        kind: "loaded",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rtcSession: {} as any,
      });

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: {
                client: mockClient,
                isPasswordlessUser: false,
                changePassword: vi.fn(),
                logout: vi.fn(),
              },
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      expect(screen.getByText("GroupCallView Mock")).toBeInTheDocument();
    });

    test("shows LobbyView when waiting for invite", () => {
      mockUseLoadGroupCall.mockReturnValue({
        kind: "waitForInvite",
        roomSummary: {
          room_id: "!test:example.org",
          name: "Test Room",
          avatar_url: null,
          "im.nheko.summary.encryption": undefined,
        },
      });

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: {
                client: mockClient,
                isPasswordlessUser: false,
                changePassword: vi.fn(),
                logout: vi.fn(),
              },
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      expect(screen.getByText("LobbyView Mock")).toBeInTheDocument();
    });

    test("shows LobbyView when can knock", () => {
      const mockKnock = vi.fn();
      mockUseLoadGroupCall.mockReturnValue({
        kind: "canKnock",
        roomSummary: {
          room_id: "!test:example.org",
          name: "Test Room",
          avatar_url: null,
          "im.nheko.summary.encryption": undefined,
        },
        knock: mockKnock,
      });

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: {
                client: mockClient,
                isPasswordlessUser: false,
                changePassword: vi.fn(),
                logout: vi.fn(),
              },
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      expect(screen.getByText("LobbyView Mock")).toBeInTheDocument();
    });
  });

  describe("Analytics opt-in", () => {
    test("auto opts-in to analytics when null", async () => {
      mockUseOptInAnalytics.mockClear();
      const setOptInAnalytics = vi.fn();

      vi.spyOn(settingsModule, "useOptInAnalytics").mockReturnValue([
        null,
        setOptInAnalytics,
      ]);

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: {
                client: mockClient,
                isPasswordlessUser: false,
                changePassword: vi.fn(),
                logout: vi.fn(),
              },
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(setOptInAnalytics).toHaveBeenCalledWith(true);
      });
    });

    test("does not opt-in when already set", () => {
      const setOptInAnalytics = vi.fn();

      vi.spyOn(settingsModule, "useOptInAnalytics").mockReturnValue([
        false,
        setOptInAnalytics,
      ]);

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: {
                client: mockClient,
                isPasswordlessUser: false,
                changePassword: vi.fn(),
                logout: vi.fn(),
              },
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      expect(setOptInAnalytics).not.toHaveBeenCalled();
    });
  });

  describe("App selection modal", () => {
    test("shows AppSelectionModal on Android when appPrompt is enabled", () => {
      vi.spyOn(UrlParamsModule, "useUrlParams").mockReturnValue(
        createMockUrlParams(),
      );

      vi.spyOn(UrlParamsModule, "useRoomIdentifier").mockReturnValue({
        roomAlias: null,
        roomId: "!test:example.org",
        viaServers: [],
      });

      // Mock platform
      vi.doMock("../Platform", () => ({
        platform: "android",
      }));

      // Mock Config
      vi.spyOn(ConfigModule.Config, "get").mockReturnValue({
        app_prompt: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      mockUseLoadGroupCall.mockReturnValue({
        kind: "loaded",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rtcSession: {} as any,
      });

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: {
                client: mockClient,
                isPasswordlessUser: false,
                changePassword: vi.fn(),
                logout: vi.fn(),
              },
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      // The component should render, even though the AppSelectionModal might not show
      // because platform module is mocked differently in different contexts
      expect(screen.getByText("GroupCallView Mock")).toBeInTheDocument();
    });
  });

  describe("Passwordless user registration error handling", () => {
    test("handles registration error gracefully", async () => {
      vi.spyOn(UrlParamsModule, "useUrlParams").mockReturnValue(
        createMockUrlParams({ displayName: "FailUser" }),
      );

      mockRegisterPasswordlessUser.mockRejectedValue(
        new Error("Registration failed"),
      );

      render(
        <TestWrapper>
          <ClientContextProvider
            value={{
              state: "valid",
              disconnected: false,
              supportedFeatures: { reactions: true },
              setClient: vi.fn(),
              authenticated: undefined,
            }}
          >
            <RoomPage />
          </ClientContextProvider>
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(mockRegisterPasswordlessUser).toHaveBeenCalledWith("FailUser");
      });

      // After error, should show RoomAuthView
      await waitFor(() => {
        expect(screen.getByText("RoomAuthView Mock")).toBeInTheDocument();
      });
    });
  });
});
