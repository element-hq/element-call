/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  AudioPresets,
  DefaultReconnectPolicy,
  type RoomOptions,
  type TrackPublishDefaults,
  type VideoPreset,
  VideoPresets,
  VideoPreset as VideoPresetClass,
} from "livekit-client";

import { Config } from "../config/Config";
import { DEFAULT_CONFIG, type ConfigOptions } from "../config/ConfigOptions";

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
  const defaults = DEFAULT_CONFIG.media_quality;
  const videoConf = mediaQuality?.video;
  const screenConf = mediaQuality?.screen_share;
  const codec = mediaQuality?.video_codec ?? defaults.video_codec;

  // Camera video encoding
  const videoEncoding = {
    maxBitrate: videoConf?.max_bitrate ?? defaults.video.max_bitrate,
    maxFramerate: videoConf?.max_framerate ?? defaults.video.max_framerate,
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
          videoConf?.max_framerate ?? defaults.video.max_framerate,
        ),
    );
  } else {
    videoSimulcastLayers = [VideoPresets.h180, VideoPresets.h360];
  }

  // Screen share encoding
  const screenShareEncoding = {
    maxBitrate: screenConf?.max_bitrate ?? defaults.screen_share.max_bitrate,
    maxFramerate:
      screenConf?.max_framerate ?? defaults.screen_share.max_framerate,
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
    backupCodec: {
      codec: "vp8",
      encoding: VideoPresets.h720.encoding,
    },
  } as TrackPublishDefaults;
}

/**
 * Build LiveKit RoomOptions from config.
 * Call this after Config.init() has resolved.
 */
export function buildLiveKitOptions(
  mediaQuality?: ConfigOptions["media_quality"],
): RoomOptions {
  const videoHeight =
    mediaQuality?.video?.max_resolution ??
    DEFAULT_CONFIG.media_quality.video.max_resolution;
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
 * Requires Config.init() to have resolved first.
 */
export function getLiveKitOptions(): RoomOptions {
  return buildLiveKitOptions(Config.get().media_quality);
}
