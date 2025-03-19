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
  type Mock,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";

import { PosthogAnalytics } from "./PosthogAnalytics";
import { getUrlParams } from "../UrlParams";
import { mockConfig } from "../utils/test";

vi.mock("../UrlParams", () => ({ getUrlParams: vi.fn() }));

describe("PosthogAnalytics", () => {
  describe("embedded package", () => {
    beforeAll(() => {
      vi.stubEnv("VITE_PACKAGE", "embedded");
    });

    beforeEach(() => {
      mockConfig({});
      (getUrlParams as Mock).mockReturnValue({});
      PosthogAnalytics.resetInstance();
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("does not create instance without config value", () => {
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
      (getUrlParams as Mock).mockReturnValue({
        posthogApiHost: "https://url.example.com.localhost",
        posthogApiKey: "api_key",
      });
      expect(PosthogAnalytics.instance.isEnabled()).toBe(true);
    });
  });

  describe("full package", () => {
    beforeAll(() => {
      vi.stubEnv("VITE_PACKAGE", "full");
    });

    beforeEach(() => {
      mockConfig({});
      (getUrlParams as Mock).mockReturnValue({});
      PosthogAnalytics.resetInstance();
    });

    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("does not create instance without config value", () => {
      expect(PosthogAnalytics.instance.isEnabled()).toBe(false);
    });

    it("ignores URL params and does not create instance", () => {
      (getUrlParams as Mock).mockReturnValue({
        posthogApiHost: "https://url.example.com.localhost",
        posthogApiKey: "api_key",
      });
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
});
