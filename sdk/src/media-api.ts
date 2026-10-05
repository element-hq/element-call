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

import {
  type Track,
  type TrackProcessor,
  type VideoCodec,
} from "livekit-client";
import { type Observable } from "rxjs";

import { type Behavior } from "./reactive/Behavior";

export interface AudioCaptureSettings {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface VideoCaptureSettings {
  resolution?: { width: number; height: number; frameRate?: number };
  maxBitrate?: number;
  maxFramerate?: number;
  codec?: VideoCodec;
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
      /** Background blur and the like. */
      processor?: TrackProcessor<Track.Kind.Video>;
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
  /** False when the SFU reports the track as unencrypted. */
  encrypted$: Behavior<boolean>;
  /** Polled while subscribed. */
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
  setProcessor(
    processor: TrackProcessor<Track.Kind.Video> | undefined,
  ): Promise<void>;
}

export type EncryptionError = "MissingKey" | "InvalidKey";

/**
 * The media of one member, backed by a LiveKit participant inside the SDK.
 * There is no identity field: the LiveKit identity is the member's `id`.
 */
export interface MemberMedia {
  local: boolean;
  /**
   * One entry per published track, in publication order. An entry stays the
   * same object for as long as the same publication is behind it. Which
   * track is which is in its `source`; `trackBySource$` picks one out.
   */
  tracks$: Behavior<(AudioMediaTrack | VideoMediaTrack)[]>;

  /** Emits when the SFU reports a key problem for this member. */
  encryptionError$: Observable<EncryptionError>;
}

export interface LocalMemberMedia extends MemberMedia {
  local: true;
  tracks$: Behavior<(LocalAudioMediaTrack | LocalVideoMediaTrack)[]>;
}
