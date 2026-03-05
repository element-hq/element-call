/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { VideoPresets } from "livekit-client";

import { buildLiveKitOptions, getLiveKitOptions } from "./options";
import { Config } from "../config/Config";

vi.mock("../config/Config", () => ({
  Config: {
    get: vi.fn(),
  },
}));

describe("buildLiveKitOptions", () => {
  it("returns sensible defaults with no config", () => {
    const opts = buildLiveKitOptions();
    expect(opts.adaptiveStream).toBe(true);
    expect(opts.dynacast).toBe(true);
    expect(opts.videoCaptureDefaults?.resolution).toEqual(
      VideoPresets.h720.resolution,
    );
    expect(opts.publishDefaults?.videoCodec).toBe("vp8");
    expect(opts.publishDefaults?.videoEncoding).toEqual({
      maxBitrate: 1_700_000,
      maxFramerate: 30,
    });
    expect(opts.publishDefaults?.screenShareEncoding).toEqual({
      maxBitrate: 5_000_000,
      maxFramerate: 30,
    });
    expect(opts.publishDefaults?.videoSimulcastLayers).toEqual([
      VideoPresets.h180,
      VideoPresets.h360,
    ]);
  });

  it("applies video codec from config", () => {
    const opts = buildLiveKitOptions({ video_codec: "vp9" });
    expect(opts.publishDefaults?.videoCodec).toBe("vp9");
  });

  it("applies video resolution and encoding from config", () => {
    const opts = buildLiveKitOptions({
      video: {
        max_resolution: 1080,
        max_bitrate: 3_000_000,
        max_framerate: 60,
      },
    });
    expect(opts.videoCaptureDefaults?.resolution).toEqual(
      VideoPresets.h1080.resolution,
    );
    expect(opts.publishDefaults?.videoEncoding).toEqual({
      maxBitrate: 3_000_000,
      maxFramerate: 60,
    });
  });

  it("applies screen share encoding from config", () => {
    const opts = buildLiveKitOptions({
      screen_share: {
        max_bitrate: 8_000_000,
        max_framerate: 15,
      },
    });
    expect(opts.publishDefaults?.screenShareEncoding).toEqual({
      maxBitrate: 8_000_000,
      maxFramerate: 15,
    });
  });

  it("uses DEFAULT_CONFIG defaults when only resolution is set", () => {
    const opts = buildLiveKitOptions({
      screen_share: {
        max_resolution: 720,
      },
    });
    // Bitrate and framerate fall back to DEFAULT_CONFIG, not the preset
    expect(opts.publishDefaults?.screenShareEncoding).toEqual({
      maxBitrate: 5_000_000,
      maxFramerate: 30,
    });
  });

  it("applies custom video simulcast layers", () => {
    const opts = buildLiveKitOptions({
      video: {
        simulcast_layers: [
          { height: 180, bitrate: 100_000 },
          { height: 360, bitrate: 300_000 },
          { height: 540, bitrate: 600_000 },
        ],
        max_framerate: 24,
      },
    });
    const layers = opts.publishDefaults?.videoSimulcastLayers;
    expect(layers).toHaveLength(3);
    expect(layers?.[0]).toMatchObject({
      width: 320,
      height: 180,
      encoding: { maxBitrate: 100_000, maxFramerate: 24 },
    });
    expect(layers?.[2]).toMatchObject({
      width: 960,
      height: 540,
      encoding: { maxBitrate: 600_000, maxFramerate: 24 },
    });
  });

  it("applies custom screen share simulcast layers", () => {
    const opts = buildLiveKitOptions({
      screen_share: {
        simulcast_layers: [{ height: 540, bitrate: 1_000_000, framerate: 5 }],
      },
    });
    const layers = opts.publishDefaults?.screenShareSimulcastLayers;
    expect(layers).toHaveLength(1);
    expect(layers?.[0]).toMatchObject({
      width: 960,
      height: 540,
      encoding: { maxBitrate: 1_000_000, maxFramerate: 5 },
    });
  });

  it("does not include screenShareSimulcastLayers when not configured", () => {
    const opts = buildLiveKitOptions();
    expect(opts.publishDefaults?.screenShareSimulcastLayers).toBeUndefined();
  });

  it("backupCodec always uses stock VP8 720p encoding", () => {
    const opts = buildLiveKitOptions({
      video_codec: "av1",
      video: { max_bitrate: 10_000_000, max_framerate: 60 },
    });
    const backup = opts.publishDefaults?.backupCodec as {
      codec: string;
      encoding: { maxBitrate: number; maxFramerate: number };
    };
    expect(backup.codec).toBe("vp8");
    expect(backup.encoding).toEqual(VideoPresets.h720.encoding);
  });
});

describe("getLiveKitOptions", () => {
  it("reads from Config singleton", () => {
    vi.mocked(Config.get).mockReturnValue({
      media_quality: { video_codec: "h264" },
    } as ReturnType<typeof Config.get>);
    const opts = getLiveKitOptions();
    expect(opts.publishDefaults?.videoCodec).toBe("h264");
  });

  it("throws when Config is not initialized", () => {
    vi.mocked(Config.get).mockImplementation(() => {
      throw new Error("Config not initialized");
    });
    expect(() => getLiveKitOptions()).toThrow("Config not initialized");
  });
});
