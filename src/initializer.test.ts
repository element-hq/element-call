/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { mockConfig } from "./utils/test";

const sentryInitSpy = vi.fn();

// Place the mock after the spy is defined
vi.mock("@sentry/react", () => ({
  init: sentryInitSpy,
  reactRouterV7BrowserTracingIntegration: vi.fn(),
}));

describe("Initializer", async () => {
  // we import here to make sure that Sentry is mocked first
  const { Initializer } = await import("./initializer.tsx");
  describe("initBeforeReact()", () => {
    it("sets font family from URL param", async () => {
      window.location.hash = "#?font=DejaVu Sans";
      await Initializer.initBeforeReact();
      expect(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--font-family",
        ),
      ).toBe('"DejaVu Sans"');
    });

    it("sets font scale from URL param", async () => {
      window.location.hash = "#?fontScale=1.2";
      await Initializer.initBeforeReact();
      expect(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--font-scale",
        ),
      ).toBe("1.2");
    });
  });

  describe("init()", () => {
    describe("sentry setup", () => {
      describe("embedded package", () => {
        beforeAll(() => {
          vi.stubEnv("VITE_PACKAGE", "embedded");
        });

        beforeEach(() => {
          mockConfig({});
          window.location.hash = "#";
          Initializer.reset();
        });

        afterEach(() => {
          sentryInitSpy.mockClear();
        });

        afterAll(() => {
          vi.unstubAllEnvs();
        });

        it("does not call Sentry.init() without config value", async () => {
          await Initializer.init();
          expect(sentryInitSpy).not.toHaveBeenCalled();
        });

        it("ignores config value and does not create instance", async () => {
          mockConfig({
            sentry: {
              DSN: "https://config.example.com.localhost",
              environment: "config",
            },
          });
          await Initializer.init();
          expect(sentryInitSpy).not.toHaveBeenCalled();
        });

        it("uses sentryDsn param if set", async () => {
          window.location.hash = `#?sentryDsn=${encodeURIComponent("https://dsn.example.com.localhost")}`;
          await Initializer.init();
          expect(sentryInitSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              dsn: "https://dsn.example.com.localhost",
              environment: undefined,
            }),
          );
        });

        it("uses sentryDsn and sentryEnvironment params if set", async () => {
          window.location.hash = `#?sentryDsn=${encodeURIComponent("https://dsn.example.com.localhost")}&sentryEnvironment=fooEnvironment`;
          await Initializer.init();
          expect(sentryInitSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              dsn: "https://dsn.example.com.localhost",
              environment: "fooEnvironment",
            }),
          );
        });
      });

      describe("full package", () => {
        beforeAll(() => {
          vi.stubEnv("VITE_PACKAGE", "full");
        });

        beforeEach(() => {
          mockConfig({});
          window.location.hash = "#";
          Initializer.reset();
        });

        afterEach(() => {
          sentryInitSpy.mockClear();
        });

        afterAll(() => {
          vi.unstubAllEnvs();
        });

        it("does not create instance without config value or URL param", async () => {
          await Initializer.init();
          expect(sentryInitSpy).not.toHaveBeenCalled();
        });

        it("ignores URL params and does not create instance", async () => {
          window.location.hash = `#?sentryDsn=${encodeURIComponent("https://dsn.example.com.localhost")}&sentryEnvironment=fooEnvironment`;
          await Initializer.init();
          expect(sentryInitSpy).not.toHaveBeenCalled();
        });

        it("creates instance with config value", async () => {
          mockConfig({
            sentry: {
              DSN: "https://dsn.example.com.localhost",
              environment: "fooEnvironment",
            },
          });
          await Initializer.init();
          expect(sentryInitSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              dsn: "https://dsn.example.com.localhost",
              environment: "fooEnvironment",
            }),
          );
        });
      });
    });
  });
});
