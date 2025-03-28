/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  expect,
  describe,
  it,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { useState, type ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { type MatrixClient } from "matrix-js-sdk/lib/client";

import { useSubmitRageshake, getRageshakeSubmitUrl } from "./submit-rageshake";
import { ClientContextProvider } from "../ClientContext";
import { getUrlParams } from "../UrlParams";
import { mockConfig } from "../utils/test";

vi.mock("../UrlParams", () => ({ getUrlParams: vi.fn() }));

const TestComponent = ({
  sendLogs,
  getRageshakeSubmitUrl,
}: {
  sendLogs: boolean;
  getRageshakeSubmitUrl: () => string | undefined;
}): ReactElement => {
  const [clickError, setClickError] = useState<Error | null>(null);
  const { available, sending, sent, submitRageshake, error } =
    useSubmitRageshake(getRageshakeSubmitUrl);

  const onClick = (): void => {
    submitRageshake({
      sendLogs,
    }).catch((e) => {
      setClickError(e);
    });
  };

  return (
    <div>
      <p data-testid="available">{available ? "true" : "false"}</p>
      <p data-testid="sending">{sending ? "true" : "false"}</p>
      <p data-testid="sent">{sent ? "true" : "false"}</p>
      <p data-testid="error">{error?.message}</p>
      <p data-testid="clickError">{clickError?.message}</p>
      <button onClick={onClick} data-testid="submit">
        submit
      </button>
    </div>
  );
};

function renderWithMockClient(
  getRageshakeSubmitUrl: () => string | undefined,
  sendLogs: boolean,
): void {
  const client = vi.mocked<MatrixClient>({
    getUserId: vi.fn().mockReturnValue("@user:localhost"),
    getUser: vi.fn().mockReturnValue(null),
    credentials: {
      userId: "@user:localhost",
    },
    getCrypto: vi.fn().mockReturnValue(undefined),
  } as unknown as MatrixClient);

  render(
    <ClientContextProvider
      value={{
        state: "valid",
        disconnected: false,
        supportedFeatures: {
          reactions: true,
          thumbnails: true,
        },
        setClient: vi.fn(),
        authenticated: {
          client,
          isPasswordlessUser: true,
          changePassword: vi.fn(),
          logout: vi.fn(),
        },
      }}
    >
      <TestComponent
        sendLogs={sendLogs}
        getRageshakeSubmitUrl={getRageshakeSubmitUrl}
      />
    </ClientContextProvider>,
  );
}

describe("useSubmitRageshake", () => {
  describe("available", () => {
    beforeEach(() => {
      (getUrlParams as Mock).mockReturnValue({});
      mockConfig({});
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    describe("embedded package", () => {
      beforeEach(() => {
        vi.stubEnv("VITE_PACKAGE", "embedded");
      });

      it("returns false with no rageshakeSubmitUrl URL param", () => {
        renderWithMockClient(getRageshakeSubmitUrl, false);
        expect(screen.getByTestId("available").textContent).toBe("false");
      });

      it("ignores config value and returns false with no rageshakeSubmitUrl URL param", () => {
        mockConfig({
          rageshake: {
            submit_url: "https://config.example.com.localhost",
          },
        });
        renderWithMockClient(getRageshakeSubmitUrl, false);
        expect(screen.getByTestId("available").textContent).toBe("false");
      });

      it("returns true with rageshakeSubmitUrl URL param", () => {
        (getUrlParams as Mock).mockReturnValue({
          rageshakeSubmitUrl: "https://url.example.com.localhost",
        });
        renderWithMockClient(getRageshakeSubmitUrl, false);
        expect(screen.getByTestId("available").textContent).toBe("true");
      });
    });

    describe("full package", () => {
      beforeEach(() => {
        mockConfig({});
        vi.stubEnv("VITE_PACKAGE", "full");
      });
      it("returns false with no config value", () => {
        renderWithMockClient(getRageshakeSubmitUrl, false);
        expect(screen.getByTestId("available").textContent).toBe("false");
      });

      it("ignores rageshakeSubmitUrl URL param and returns false with no config value", () => {
        (getUrlParams as Mock).mockReturnValue({
          rageshakeSubmitUrl: "https://url.example.com.localhost",
        });
        renderWithMockClient(getRageshakeSubmitUrl, false);
        expect(screen.getByTestId("available").textContent).toBe("false");
      });

      it("returns true with config value", () => {
        mockConfig({
          rageshake: {
            submit_url: "https://config.example.com.localhost",
          },
        });
        renderWithMockClient(getRageshakeSubmitUrl, false);
        expect(screen.getByTestId("available").textContent).toBe("true");
      });
    });
  });

  describe("when rageshake is available", () => {
    beforeEach(() => {
      mockConfig({});
      vi.unstubAllGlobals();
    });

    it("starts unsent", () => {
      renderWithMockClient(() => "https://rageshake.localhost/foo", false);
      expect(screen.getByTestId("sending").textContent).toBe("false");
      expect(screen.getByTestId("sent").textContent).toBe("false");
    });

    it("submitRageshake fetches expected URL", async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        status: 200,
      });
      vi.stubGlobal("fetch", fetchFn);

      renderWithMockClient(() => "https://rageshake.localhost/foo", false);
      screen.getByTestId("submit").click();
      await waitFor(() => {
        expect(screen.getByTestId("sent").textContent).toBe("true");
      });
      expect(fetchFn).toHaveBeenCalledExactlyOnceWith(
        "https://rageshake.localhost/foo",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(screen.getByTestId("clickError").textContent).toBe("");
      expect(screen.getByTestId("error").textContent).toBe("");
    });
  });

  describe("when rageshake is not available", () => {
    it("starts unsent", () => {
      renderWithMockClient(() => undefined, false);
      expect(screen.getByTestId("sending").textContent).toBe("false");
      expect(screen.getByTestId("sent").textContent).toBe("false");
    });

    it("submitRageshake throws error", async () => {
      renderWithMockClient(() => undefined, false);
      screen.getByTestId("submit").click();
      await waitFor(() => {
        expect(screen.getByTestId("clickError").textContent).toBe(
          "No rageshake URL is configured",
        );
      });
    });
  });
});
