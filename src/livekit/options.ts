/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  AudioPresets,
  DefaultReconnectPolicy,
  type RoomOptions,
  ScreenSharePresets,
  type TrackPublishDefaults,
  type VideoPreset,
  VideoPresets,
  VideoPreset as VideoPresetClass,
} from "livekit-client";

import { Config } from "../config/Config";
import type { ConfigOptions } from "../config/ConfigOptions";

/**
 * Find the closest matching VideoPreset for a given height.
 */
function videoPresetForHeight(height: number): VideoPreset {
  if (height <= 180) return VideoPresets.h180;
  if (height <= 360) return VideoPresets.h360;
  if (height <= 540) return VideoPresets.h540;
  if (height <= 720) return VideoPresets.h720;
  if (height <= 1080) return VideoPresets.h1080;
  if (height <= 1440) return VideoPresets.h1440;
  return VideoPresets.h2160;
}

/**
 * Build LiveKit publish options from config, falling back to sensible defaults.
 */
function buildPublishOptions(
  mediaQuality: ConfigOptions["media_quality"],
): TrackPublishDefaults {
  const videoConf = mediaQuality?.video;
  const screenConf = mediaQuality?.screen_share;
  const codec = mediaQuality?.video_codec ?? "vp8";

  // Camera video encoding
  const videoHeight = videoConf?.max_resolution ?? 720;
  const basePreset = videoPresetForHeight(videoHeight);
  const videoEncoding = {
    maxBitrate: videoConf?.max_bitrate ?? basePreset.encoding.maxBitrate,
    maxFramerate: videoConf?.max_framerate ?? basePreset.encoding.maxFramerate,
  };

  // Camera simulcast layers
  let videoSimulcastLayers: VideoPreset[];
  if (videoConf?.simulcast_layers) {
    videoSimulcastLayers = videoConf.simulcast_layers.map(
      (layer) =>
        new VideoPresetClass(
          Math.round((layer.height * 16) / 9),
          layer.height,
          layer.bitrate,
          videoConf?.max_framerate ?? 30,
        ),
    );
  } else {
    videoSimulcastLayers = [VideoPresets.h180, VideoPresets.h360];
  }

  // Screen share encoding
  const screenHeight = screenConf?.max_resolution ?? 1080;
  const screenBasePreset =
    screenHeight <= 720
      ? ScreenSharePresets.h720fps30
      : ScreenSharePresets.h1080fps30;
  const screenShareEncoding = {
    maxBitrate: screenConf?.max_bitrate ?? screenBasePreset.encoding.maxBitrate,
    maxFramerate:
      screenConf?.max_framerate ?? screenBasePreset.encoding.maxFramerate,
  };

  // Screen share simulcast layers
  let screenShareSimulcastLayers: VideoPreset[] | undefined;
  if (screenConf?.simulcast_layers) {
    screenShareSimulcastLayers = screenConf.simulcast_layers.map(
      (layer) =>
        new VideoPresetClass(
          Math.round((layer.height * 16) / 9),
          layer.height,
          layer.bitrate,
          layer.framerate ?? screenConf?.max_framerate ?? 30,
        ),
    );
  }

  return {
    audioPreset: AudioPresets.music,
    dtx: true,
    // disable red because the livekit server strips out red packets for clients
    // that don't support it (firefox) but of course that doesn't work with e2ee.
    red: false,
    forceStereo: false,
    simulcast: true,
    videoSimulcastLayers: videoSimulcastLayers as VideoPreset[],
    screenShareEncoding,
    ...(screenShareSimulcastLayers && {
      screenShareSimulcastLayers: screenShareSimulcastLayers as VideoPreset[],
    }),
    stopMicTrackOnMute: false,
    videoCodec: codec,
    videoEncoding,
    backupCodec: { codec: "vp8", encoding: videoEncoding },
  } as TrackPublishDefaults;
}

/**
 * Build LiveKit RoomOptions from config.
 * Call this after Config.init() has resolved.
 */
export function buildLiveKitOptions(
  mediaQuality?: ConfigOptions["media_quality"],
): RoomOptions {
  const videoHeight = mediaQuality?.video?.max_resolution ?? 720;
  const basePreset = videoPresetForHeight(videoHeight);

  return {
    // automatically manage subscribed video quality
    adaptiveStream: true,

    // optimize publishing bandwidth and CPU for published tracks
    dynacast: true,

    // capture settings
    videoCaptureDefaults: {
      resolution: basePreset.resolution,
    },

    // publish settings
    publishDefaults: buildPublishOptions(mediaQuality),

    // default LiveKit options that seem to be sane
    stopLocalTrackOnUnpublish: true,
    reconnectPolicy: new DefaultReconnectPolicy(),
    disconnectOnPageLeave: true,
    webAudioMix: false,
  };
}

/**
 * Get LiveKit options, reading from the loaded Config singleton.
 * Falls back to defaults if Config is not yet initialized.
 */
export function getLiveKitOptions(): RoomOptions {
  try {
    return buildLiveKitOptions(Config.get().media_quality);
  } catch {
    return buildLiveKitOptions();
  }
}

// Keep backward-compatible export for existing consumers
export const defaultLiveKitOptions: RoomOptions = buildLiveKitOptions();
