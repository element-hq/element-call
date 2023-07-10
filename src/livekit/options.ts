import {
  AudioPresets,
  DefaultReconnectPolicy,
  RoomOptions,
  ScreenSharePresets,
  TrackPublishDefaults,
  VideoPreset,
  VideoPresets,
} from "livekit-client";

const defaultLiveKitPublishOptions: TrackPublishDefaults = {
  audioPreset: AudioPresets.music,
  dtx: true,
  red: true,
  forceStereo: false,
  simulcast: true,
  videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360] as VideoPreset[],
  screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
  stopMicTrackOnMute: false,
  videoCodec: "vp8",
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
  expWebAudioMix: false,
};
