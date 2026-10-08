/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The public media types of the SDK: what a member publishes, the tracks it
 * arrives as and how a host renders them. The client and member types are in
 * `api.ts`.
 */

import { type Observable } from "rxjs";

import { type Behavior } from "./reactive/Behavior";

export interface AudioCaptureSettings {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export type VideoCodec = "vp8" | "h264" | "vp9" | "av1" | "h265";

export interface VideoCaptureSettings {
  resolution?: { width: number; height: number; frameRate?: number };
  maxBitrate?: number;
  maxFramerate?: number;
  codec?: VideoCodec;
}

/** What a processor is given to work on: the captured track and, where a view is attached, its element. */
export interface VideoProcessorInit {
  track: MediaStreamTrack;
  element?: HTMLMediaElement;
}

/**
 * Transforms a camera track before it is published: background blur and the
 * like. `processedTrack` is what gets published once `init` has resolved;
 * `restart` is called with the new track where the camera changes. The shape
 * is that of a LiveKit track processor, so one of those can be passed as is.
 */
export interface VideoProcessor {
  name: string;
  processedTrack?: MediaStreamTrack;
  init(opts: VideoProcessorInit): Promise<void>;
  restart(opts: VideoProcessorInit): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * One thing to publish: a source, where to capture it from and how to encode
 * it. Where the device and the settings are left out, the browser's and
 * LiveKit's defaults apply.
 */
export type PublishRequest =
  | { source: "microphone"; deviceId?: string; capture?: AudioCaptureSettings }
  | {
      source: "camera";
      deviceId?: string;
      /** Background blur and the like, applied before the first frame is published. */
      processor?: VideoProcessor;
      capture?: VideoCaptureSettings;
    }
  | {
      source: "screenShare";
      /** Whether to capture the screen's audio too. Default true. */
      audio?: boolean;
      capture?: VideoCaptureSettings;
    };

export type MediaSource =
  | "microphone"
  | "camera"
  | "screenShare"
  | "screenShareAudio"
  /** Published without a source; the application knows what it is. */
  | "unknown";

export type MediaStreamStats =
  | RTCInboundRtpStreamStats
  | RTCOutboundRtpStreamStats
  | undefined;

/** One published track of a member. */
export interface MediaTrack {
  source: MediaSource;
  kind: "audio" | "video";
  /** Stable for the life of the track. */
  id: string;
  muted$: Behavior<boolean>;
  /**
   * False when the SFU reports the track as unencrypted. Fixed for the life
   * of the track: a publisher that changes its encryption publishes anew.
   */
  encrypted: boolean;
  /** Polled while subscribed. */
  // REVIEW: we want the perf gain of not having it always run.
  //
  // proposals
  //  - obs -> on subscribe start polling timer
  //  - add public method the MediaTrack: for example: actiavteStatsPolling(ms)
  stats$: Behavior<MediaStreamStats>;
  /**
   * Rendering. The view hands its `<video>` or `<audio>` element over; the SDK
   * sets its stream and, for video, registers the size and on-screen observers
   * that pick a simulcast layer and pause the subscription while the element is
   * hidden. `attach` is idempotent per element; `detach` has to be called
   * before the element leaves the DOM so those observers are released.
   */
  attach(element: HTMLMediaElement): void;
  detach(element: HTMLMediaElement): void;
}

export interface AudioMediaTrack extends MediaTrack {
  kind: "audio";
  /**
   * Whether the track carries sound right now, as the backend measures it.
   * False while muted. A call reads this on the microphone track and calls it
   * "speaking". LiveKit measures it per member, so every audio track of a
   * member reports the same value.
   */
  // REVIEW: audio Level (could even super-seed isActive "audioLevel != 0")
  isActive$: Behavior<boolean>;
  /** Route playback through Web Audio, for earpiece pan and gain. Undefined resets. */
  setAudioContext(ctx: AudioContext | undefined, plugins?: AudioNode[]): void;
  setVolume(volume: number): void;
}

export interface VideoMediaTrack extends MediaTrack {
  kind: "video";
}

/** The controls a member has over a track it publishes itself. */
export interface LocalMediaTrack {
  /**
   * Mutes or unmutes. Resolves with the state that resulted, which differs
   * from the request where the device could not be used.
   */
  setEnabled(enabled: boolean): Promise<boolean>;
  /** Captures from another device. Rejects for a screen share, which has none. */
  setDevice(deviceId: string): Promise<void>;
}

export interface LocalAudioMediaTrack
  extends AudioMediaTrack, LocalMediaTrack {}

export interface LocalVideoMediaTrack extends VideoMediaTrack, LocalMediaTrack {
  /** For mirroring; undefined where the camera does not say which way it faces. */
  facingMode$: Behavior<"user" | "environment" | undefined>;
  /**
   * Restarts the camera facing the other way, on devices with a front and a
   * back camera, and resolves with the id of the device now in use. Does
   * nothing where the facing mode is unknown.
   */
  switchFacingMode(): Promise<string | undefined>;
  /** Background blur and the like; undefined removes the processor. */
  setProcessor(processor: VideoProcessor | undefined): Promise<void>;
}

export type EncryptionError = "MissingKey" | "InvalidKey";

/**
 * What a member sends, once it has arrived on its transport: its tracks, null
 * while nothing has arrived for it, and the key errors beside them. The media
 * backend supplies exactly these two fields per member.
 */
export interface MemberMedia {
  /**
   * The member's tracks, in publication order, once it has shown up on its
   * transport; null until then ("waiting for media"). An entry stays the same
   * object for as long as the same publication is behind it. Which track is
   * which is in its `source`; `trackBySource$` picks one out.
   */
  tracks$: Behavior<(AudioMediaTrack | VideoMediaTrack)[] | null>;
  /** Emits when the SFU reports a key problem for this member. */
  encryptionError$: Observable<EncryptionError>;
}

export interface LocalMemberMedia extends MemberMedia {
  tracks$: Behavior<(LocalAudioMediaTrack | LocalVideoMediaTrack)[] | null>;
}
