/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, beforeEach } from "vitest";

import {
  Setting,
  parseResolution,
  seedSettingsFromConfig,
  screenShareCodec,
  screenShareResolution,
  screenShareFramerate,
  screenShareBitrate,
  cameraCodec,
  cameraResolution,
  cameraFramerate,
  cameraBitrate,
} from "./settings";

beforeEach(() => {
  localStorage.clear();
});

describe("parseResolution", () => {
  it("parses a WIDTHxHEIGHT string", () => {
    expect(parseResolution("1920x1080")).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("parses non-standard resolutions", () => {
    expect(parseResolution("640x360")).toEqual({ width: 640, height: 360 });
  });
});

describe("Setting", () => {
  describe("seedFromConfig", () => {
    it("updates value when no localStorage value exists", () => {
      const setting = new Setting<string>("test-seed", "default");
      setting.seedFromConfig("from-config");
      expect(setting.getValue()).toBe("from-config");
    });

    it("does not override an existing localStorage value", () => {
      localStorage.setItem(
        "matrix-setting-test-seed-existing",
        JSON.stringify("user-set"),
      );
      const setting = new Setting<string>("test-seed-existing", "default");
      expect(setting.getValue()).toBe("user-set");
      setting.seedFromConfig("from-config");
      expect(setting.getValue()).toBe("user-set");
    });
  });
});

describe("seedSettingsFromConfig", () => {
  it("does nothing when config is undefined", () => {
    const codecBefore = screenShareCodec.getValue();
    seedSettingsFromConfig(undefined);
    expect(screenShareCodec.getValue()).toBe(codecBefore);
  });

  it("seeds video codec to both camera and screen share", () => {
    seedSettingsFromConfig({ video_codec: "av1" });
    expect(screenShareCodec.getValue()).toBe("av1");
    expect(cameraCodec.getValue()).toBe("av1");
  });

  it("seeds screen share settings from config", () => {
    seedSettingsFromConfig({
      screen_share: {
        max_resolution: 720,
        max_framerate: 15,
        max_bitrate: 2_000_000,
      },
    });
    expect(screenShareResolution.getValue()).toBe("1280x720");
    expect(screenShareFramerate.getValue()).toBe(15);
    expect(screenShareBitrate.getValue()).toBe(2_000_000);
  });

  it("seeds camera/video settings from config", () => {
    seedSettingsFromConfig({
      video: {
        max_resolution: 1080,
        max_framerate: 60,
        max_bitrate: 4_000_000,
      },
    });
    expect(cameraResolution.getValue()).toBe("1920x1080");
    expect(cameraFramerate.getValue()).toBe(60);
    expect(cameraBitrate.getValue()).toBe(4_000_000);
  });

  it("only seeds provided fields, leaves others at defaults", () => {
    const defaultFramerate = screenShareFramerate.getValue();
    seedSettingsFromConfig({
      screen_share: {
        max_bitrate: 3_000_000,
      },
    });
    expect(screenShareBitrate.getValue()).toBe(3_000_000);
    expect(screenShareFramerate.getValue()).toBe(defaultFramerate);
  });
});
