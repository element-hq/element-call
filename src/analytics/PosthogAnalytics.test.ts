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
  beforeAll,
  afterAll,
} from "vitest";
import posthog, { type Properties } from "posthog-js";

import { PosthogAnalytics } from "./PosthogAnalytics";
import { mockConfig } from "../utils/test";

describe("PosthogAnalytics", () => {
  describe("embedded package", () => {
    beforeAll(() => {
      vi.stubEnv("VITE_PACKAGE", "embedded");
    });

    beforeEach(() => {
      mockConfig({});
      window.location.hash = "#";
      PosthogAnalytics.resetInstance();
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("does not create instance without config value or URL params", () => {
      expect(PosthogAnalytics.instance.isEnabled()).toBe(false);
    });

    it("ignores config value and does not create instance", () => {
      mockConfig({
        posthog: {
          api_host: "https://api.example.com.localhost",
          api_key: "api_key",
        },
      });
      expect(PosthogAnalytics.instance.isEnabled()).toBe(false);
    });

    it("uses URL params if both set", () => {
      window.location.hash = `#?posthogApiHost=${encodeURIComponent("https://url.example.com.localhost")}&posthogApiKey=api_key`;
      expect(PosthogAnalytics.instance.isEnabled()).toBe(true);
    });
  });

  describe("full package", () => {
    beforeAll(() => {
      vi.stubEnv("VITE_PACKAGE", "full");
    });

    beforeEach(() => {
      mockConfig({});
      window.location.hash = "#";
      PosthogAnalytics.resetInstance();
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("does not create instance without config value", () => {
      expect(PosthogAnalytics.instance.isEnabled()).toBe(false);
    });

    it("ignores URL params and does not create instance", () => {
      window.location.hash = `#?posthogApiHost=${encodeURIComponent("https://url.example.com.localhost")}&posthogApiKey=api_key`;
      expect(PosthogAnalytics.instance.isEnabled()).toBe(false);
    });

    it("creates instance with config value", () => {
      mockConfig({
        posthog: {
          api_host: "https://api.example.com.localhost",
          api_key: "api_key",
        },
      });
      expect(PosthogAnalytics.instance.isEnabled()).toBe(true);
    });
  });

  describe("sanitizeProperties", () => {
    beforeAll(() => {
      vi.stubEnv("VITE_PACKAGE", "full");
    });

    beforeEach(() => {
      mockConfig({
        posthog: {
          api_host: "https://api.example.com.localhost",
          api_key: "api_key",
        },
      });
      PosthogAnalytics.resetInstance();
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("drops $initial_person_info from event properties", () => {
      const initSpy = vi.spyOn(posthog, "init");
      expect(PosthogAnalytics.instance.isEnabled()).toBe(true);

      const sanitize = initSpy.mock.calls[0][1]?.sanitize_properties;
      expect(sanitize).toBeDefined();

      const sanitized = sanitize!(
        {
          $current_url: "https://call.example.com/some/private/path",
          $initial_person_info: {
            r: "https://example.com/referrer",
            u: "https://call.example.com/some/private/path",
          },
        } as Properties,
        "anyEvent",
      );

      expect(sanitized).not.toHaveProperty("$initial_person_info");
    });
  });
});
