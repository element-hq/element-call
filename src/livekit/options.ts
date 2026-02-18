/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  AudioPresets,
  DefaultReconnectPolicy,
  VideoPreset,
  type RoomOptions,
  ScreenSharePresets,
  type TrackPublishDefaults,
  VideoPresets,
} from "livekit-client";
import { Config } from "../config/Config";
import { getUrlParams } from "../UrlParams";

const defaultLiveKitPublishOptions: TrackPublishDefaults = {
  audioPreset: AudioPresets.music,
  dtx: true,
  // disable red because the livekit server strips out red packets for clients
  // that don't support it (firefox) but of course that doesn't work with e2ee.
  red: false,
  forceStereo: false,
  simulcast: true,
  videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360] as VideoPreset[],
  stopMicTrackOnMute: false,
  videoCodec: "vp8",
  videoEncoding: VideoPresets.h720.encoding,
  backupCodec: { codec: "vp8", encoding: VideoPresets.h720.encoding },
} as const;

const resolutionMap: Record<string, { width: number; height: number }> = {
  "2160p": { width: 3840, height: 2160 },
  "1440p": { width: 2560, height: 1440 },
  "1080p": { width: 1920, height: 1080 },
  "720p": { width: 1280, height: 720 },
  "480p": { width: 854, height: 480 },
};

const defaultBitrateForRes: Record<string, number> = {
  "2160p": 16_000_000,
  "1440p": 10_000_000,
  "1080p": 5_000_000,
  "720p": 2_000_000,
  "480p": 800_000,
};

/**
 * Resolve screen share encoding from (in priority order):
 *   1. URL parameters (screenShareRes, screenShareFps, screenShareBitrate)
 *   2. config.json screen_share settings
 *   3. Hardcoded default: 1080p30 / 5 Mbps
 */
function resolveScreenShareEncoding(): VideoPreset {
  const urlParams = getUrlParams();
  let res: string | undefined = urlParams.screenShareRes;
  let fps: number | undefined = urlParams.screenShareFps;
  let bitrate: number | undefined = urlParams.screenShareBitrate;

  // Fall back to config.json
  try {
    const cfg = Config.get().screen_share;
    if (cfg) {
      if (!res) res = cfg.max_resolution;
      if (fps === undefined) fps = cfg.max_framerate;
      if (bitrate === undefined) bitrate = cfg.max_bitrate;
    }
  } catch {
    // Config not yet initialized — use defaults
  }

  // Apply defaults
  const resKey = res ?? "1440p";
  const dims = resolutionMap[resKey] ?? resolutionMap["1440p"];
  const finalFps = fps ?? 60;
  const finalBitrate = bitrate ?? defaultBitrateForRes[resKey] ?? 13_000_000;

  return new VideoPreset(dims.width, dims.height, finalBitrate, finalFps, "medium");
}

/**
 * Build LiveKit RoomOptions with dynamically resolved screen share encoding.
 * Must be called (not imported as a const) so config/URL params are read at
 * call time rather than module load time.
 */
/**
 * Return screen share capture options (resolution + frameRate) for use
 * in setScreenShareEnabled(). livekit-client has no room-level
 * screenShareCaptureDefaults, so this must be passed explicitly.
 */
export function getScreenShareCaptureDefaults(): {
  resolution: { width: number; height: number; frameRate: number };
} {
  const preset = resolveScreenShareEncoding();
  // Use generous width so ultrawide displays aren't downscaled during capture.
  const captureWidth = Math.max(preset.width, 3840);
  return {
    resolution: {
      width: captureWidth,
      height: preset.height,
      frameRate: preset.encoding.maxFramerate ?? 30,
    },
  };
}

/**
 * Build LiveKit RoomOptions with dynamically resolved screen share encoding.
 * Must be called (not imported as a const) so config/URL params are read at
 * call time rather than module load time.
 */
export function getDefaultLiveKitOptions(): RoomOptions {
  const screenSharePreset = resolveScreenShareEncoding();

  return {
    // automatically manage subscribed video quality
    adaptiveStream: true,

    // optimize publishing bandwidth and CPU for published tracks
    dynacast: true,

    // capture settings
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
    },

    // publish settings
    publishDefaults: {
      ...defaultLiveKitPublishOptions,
      screenShareEncoding: screenSharePreset.encoding,
    },

    // default LiveKit options that seem to be sane
    stopLocalTrackOnUnpublish: true,
    reconnectPolicy: new DefaultReconnectPolicy(),
    disconnectOnPageLeave: true,
    webAudioMix: false,
  };
}
