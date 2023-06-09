import {
  AudioPresets,
  DefaultReconnectPolicy,
  RoomOptions,
  ScreenSharePresets,
  TrackPublishDefaults,
  VideoPreset,
  VideoPresets,
} from "livekit-client";

const publishOptions: TrackPublishDefaults = {
  audioPreset: AudioPresets.music,
  dtx: true,
  red: true,
  forceStereo: false,
  simulcast: true,
  videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h216] as VideoPreset[],
  screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
  stopMicTrackOnMute: false,
  videoCodec: "vp8",
  videoEncoding: VideoPresets.h360.encoding,
  backupCodec: { codec: "vp8", encoding: VideoPresets.h360.encoding },
} as const;

export const roomOptions: RoomOptions = {
  // automatically manage subscribed video quality
  adaptiveStream: true,

  // optimize publishing bandwidth and CPU for published tracks
  dynacast: true,

  // capture settings
  videoCaptureDefaults: {
    resolution: VideoPresets.h360.resolution,
  },

  // publish settings
  publishDefaults: publishOptions,

  // default LiveKit options that seem to be sane
  stopLocalTrackOnUnpublish: true,
  reconnectPolicy: new DefaultReconnectPolicy(),
  disconnectOnPageLeave: true,
  expWebAudioMix: false,
};
