/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi, afterEach } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { Config, validateConfig } from "./Config";
import { DEFAULT_CONFIG, MatrixRTCMode } from "./ConfigOptions";

describe("validateConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes through a missing matrix_rtc_mode unchanged", () => {
    const result = validateConfig({});
    expect(result.matrix_rtc_mode).toBeUndefined();
  });

  it.each(Object.values(MatrixRTCMode))(
    "keeps a valid matrix_rtc_mode value (%s)",
    (mode) => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const result = validateConfig({ matrix_rtc_mode: mode });
      expect(result.matrix_rtc_mode).toBe(mode);
      expect(warnSpy).not.toHaveBeenCalled();
    },
  );

  it("drops an invalid matrix_rtc_mode value and warns", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const result = validateConfig({
      // Intentionally bypass the type to simulate bad JSON.
      matrix_rtc_mode: "nonsense" as unknown as MatrixRTCMode,
    });
    expect(result.matrix_rtc_mode).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("nonsense");
  });

  it("does not touch unrelated fields when dropping an invalid mode", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const result = validateConfig({
      matrix_rtc_mode: "nope" as unknown as MatrixRTCMode,
      ssla: "https://example.invalid/ssla",
    });
    expect(result.matrix_rtc_mode).toBeUndefined();
    expect(result.ssla).toBe("https://example.invalid/ssla");
  });
});

describe("Config.initWith", () => {
  // vitest.setup.ts has already called initDefault(), so every test here is
  // free to re-initialize; the last call wins.
  afterEach(() => {
    vi.restoreAllMocks();
    Config.initDefault();
  });

  it("makes the supplied config readable", () => {
    Config.initWith({ ssla: "https://example.invalid/ssla" });
    expect(Config.get().ssla).toBe("https://example.invalid/ssla");
  });

  it("fills in defaults for keys the embedder did not supply", () => {
    Config.initWith({ ssla: "https://example.invalid/ssla" });
    expect(Config.get().media_quality).toEqual(DEFAULT_CONFIG.media_quality);
  });

  it("validates the supplied config just as a fetched one would be", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    Config.initWith({
      matrix_rtc_mode: "nonsense" as unknown as MatrixRTCMode,
    });
    expect(Config.get().matrix_rtc_mode).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("does not share nested state with DEFAULT_CONFIG", () => {
    Config.initWith({});
    expect(Config.get().media_quality).not.toBe(DEFAULT_CONFIG.media_quality);
  });

  it("stops a later init() from fetching over the top of it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    Config.initWith({ ssla: "https://example.invalid/ssla" });

    await Config.init();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Config.get().ssla).toBe("https://example.invalid/ssla");
  });

  it("replaces a config initialized earlier", () => {
    Config.initWith({ ssla: "https://first.invalid/ssla" });
    Config.initWith({ ssla: "https://second.invalid/ssla" });
    expect(Config.get().ssla).toBe("https://second.invalid/ssla");
  });
});
