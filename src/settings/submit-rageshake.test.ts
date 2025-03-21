/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  expect,
  describe,
  it,
  afterEach,
  vi,
  type Mock,
  beforeEach,
} from "vitest";

import {
  getRageshakeSubmitUrl,
  isRageshakeAvailable,
} from "./submit-rageshake";
import { getUrlParams } from "../UrlParams";
import { mockConfig } from "../utils/test";

vi.mock("../UrlParams", () => ({ getUrlParams: vi.fn() }));

describe("isRageshakeAvailable", () => {
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
      expect(isRageshakeAvailable()).toBe(false);
    });

    it("ignores config value and returns false with no rageshakeSubmitUrl URL param", () => {
      mockConfig({
        rageshake: {
          submit_url: "https://config.example.com.localhost",
        },
      });
      expect(isRageshakeAvailable()).toBe(false);
    });

    it("returns true with rageshakeSubmitUrl URL param", () => {
      (getUrlParams as Mock).mockReturnValue({
        rageshakeSubmitUrl: "https://url.example.com.localhost",
      });
      expect(isRageshakeAvailable()).toBe(true);
    });
  });

  describe("full package", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_PACKAGE", "full");
    });
    it("returns false with no config value", () => {
      expect(isRageshakeAvailable()).toBe(false);
    });

    it("ignores rageshakeSubmitUrl URL param and returns false with no config value", () => {
      (getUrlParams as Mock).mockReturnValue({
        rageshakeSubmitUrl: "https://url.example.com.localhost",
      });
      expect(isRageshakeAvailable()).toBe(false);
    });

    it("returns true with config value", () => {
      mockConfig({
        rageshake: {
          submit_url: "https://config.example.com.localhost",
        },
      });
      expect(isRageshakeAvailable()).toBe(true);
    });
  });
});

describe("getRageshakeSubmitUrl", () => {
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

    it("returns undefined no rageshakeSubmitUrl URL param", () => {
      expect(getRageshakeSubmitUrl()).toBeUndefined();
    });

    it("returns rageshakeSubmitUrl URL param when set", () => {
      (getUrlParams as Mock).mockReturnValue({
        rageshakeSubmitUrl: "https://url.example.com.localhost",
      });
      expect(getRageshakeSubmitUrl()).toBe("https://url.example.com.localhost");
    });

    it("ignores config param and returns undefined", () => {
      mockConfig({
        rageshake: {
          submit_url: "https://config.example.com.localhost",
        },
      });
      expect(getRageshakeSubmitUrl()).toBeUndefined();
    });
  });

  describe("full package", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_PACKAGE", "full");
    });
    it("returns undefined with no config value", () => {
      expect(getRageshakeSubmitUrl()).toBeUndefined();
    });

    it("ignores rageshakeSubmitUrl URL param and returns undefined", () => {
      (getUrlParams as Mock).mockReturnValue({
        rageshakeSubmitUrl: "https://url.example.com.localhost",
      });
      expect(getRageshakeSubmitUrl()).toBeUndefined();
    });

    it("returns config value when set", () => {
      mockConfig({
        rageshake: {
          submit_url: "https://config.example.com.localhost",
        },
      });
      expect(getRageshakeSubmitUrl()).toBe(
        "https://config.example.com.localhost",
      );
    });
  });
});
