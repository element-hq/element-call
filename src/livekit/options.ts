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
  VideoPreset,
  VideoPresets,
} from "livekit-client";

const VideoPresetsH264 = {
  h144: new VideoPreset(176, 144, 150_000, 20),
  h240: new VideoPreset(320, 240, 120_000, 20),
  h176: new VideoPreset(320, 176, 160_000, 20),
  h288: new VideoPreset(382, 288, 180_000, 20),
  h360: VideoPresets.h360,
} as const;

const defaultLiveKitPublishOptions: TrackPublishDefaults = {
  audioPreset: AudioPresets.music,
  dtx: true,
  // disable red because the livekit server strips out red packets for clients
  // that don't support it (firefox) but of course that doesn't work with e2ee.
  red: false,
  forceStereo: false,
  simulcast: true,
  videoSimulcastLayers: [
    VideoPresetsH265.h144,
    VideoPresetsH264.h360,
  ] as VideoPreset[],
  screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
  stopMicTrackOnMute: false,
  videoCodec: "h264",
  videoEncoding: VideoPresets.h720.encoding,
  backupCodec: { codec: "vp8", encoding: VideoPresets.h720.encoding },
} as const;

export const defaultLiveKitOptions: RoomOptions = {
  // automatically manage subscribed video quality
  adaptiveStream: true,

  // optimize publishing bandwidth and CPU for published tracks
  dynacast: true,

  // capture settings
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
  },

  // publish settings
  publishDefaults: defaultLiveKitPublishOptions,

  // default LiveKit options that seem to be sane
  stopLocalTrackOnUnpublish: true,
  reconnectPolicy: new DefaultReconnectPolicy(),
  disconnectOnPageLeave: true,
  webAudioMix: false,
};
