/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The public types of the SDK. `createRtcSession` in `session/RtcSession.ts`
 * is the only way to obtain an implementation of them.
 */

import {
  type CallMembership,
  type RTCCallIntent,
  type RTCNotificationType,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { type Track, type TrackProcessor } from "livekit-client";
import { type Observable } from "rxjs";

import { type Behavior } from "../../src/state/Behavior";
import { type EncryptionSystem } from "../../src/e2ee/sharedKeyManagement";
import { type MatrixRTCMode } from "../../src/config/ConfigOptions";

// ---------------------------------------------------------------------------
// Session

export interface RtcSessionOptions {
  encryptionSystem: EncryptionSystem;
  /** Resolved by the host; the SDK reads neither config.json nor settings. */
  matrixRTCMode: MatrixRTCMode;
  /**
   * MSC4075 notification sent with the join. Parameters of the MatrixRTC join
   * itself, so they are here even though they are named after calls; reacting
   * to a notification (ringing, timeouts, declines) is the application's job.
   */
  sendNotificationType?: RTCNotificationType;
  callIntent?: RTCCallIntent;
}

/** What the local member publishes. */
export interface LocalMediaInputs {
  microphoneEnabled$: Behavior<boolean>;
  cameraEnabled$: Behavior<boolean>;
  audioInputDeviceId$: Behavior<string | undefined>;
  videoInputDeviceId$: Behavior<string | undefined>;
  /** Background blur and the like. */
  videoProcessor$: Behavior<TrackProcessor<Track.Kind.Video> | undefined>;
}

export type SessionConnectionStatus =
  | "waitingForTransport"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

/**
 * An error raised by the session. `cause` holds the underlying error, which
 * lets a host that knows the backend tell the failures apart.
 */
export class RtcSessionError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RtcSessionError";
  }
}

/**
 * A session in one room. The room has to be the one the client's sync loop
 * maintains (`client.getRoom(roomId)`, once the join has synced): the
 * detached copy `joinRoom` returns for a room joined just now never receives
 * the state the members are read from.
 */
export interface RtcSession {
  join(): void;
  leave(): void;
  /** Collapsed view of the local member's state machine. */
  status$: Behavior<SessionConnectionStatus>;
  connected$: Behavior<boolean>;
  reconnecting$: Behavior<boolean>;
  /** A transport, Matrix or connection error that stops the session. */
  fatalError$: Behavior<RtcSessionError | null>;

  localMember$: Behavior<LocalRtcMember | null>;
  remoteMembers$: Behavior<RemoteRtcMember[]>;
  /** `remoteMembers.length`, plus one for the local member once it exists. */
  memberCount$: Behavior<number>;

  /**
   * Whether the session has grown large enough that MatrixRTC has stopped
   * rotating the media encryption key.
   */
  keyRotationSuppressed$: Behavior<boolean>;

  /** Transports the session currently holds a live connection to. */
  connectedTransports$: Behavior<TransportMetadata[]>;
}

// ---------------------------------------------------------------------------
// Transports

/**
 * One transport advertised in a membership. Transport independent: `type` and
 * `id` are all the SDK needs; `raw` and `resolved$` are there for a
 * backend-specific developer panel and for connection diagnostics.
 */
export interface TransportMetadata {
  /** `"livekit"` today. */
  type: string;
  /** Stable key, unique per transport in the session. For LiveKit, the service url. */
  id: string;
  /** The transport object as it appears in the membership. */
  raw: Transport;
  /**
   * What the backend had to fetch before it could connect. Undefined until the
   * connection has resolved it, and again after the connection stops.
   */
  resolved$: Behavior<ResolvedTransport | undefined>;
}

export type ResolvedTransport =
  | {
      type: "livekit";
      /** The SFU websocket url, as opposed to the JWT service url in `raw`. */
      url: string;
      /** A secret: fit for a developer panel, never for a log line. */
      token: string;
      roomAlias: string;
      identity: string;
    }
  | { type: string; [key: string]: unknown };

// ---------------------------------------------------------------------------
// Members

export interface RtcMember {
  local: boolean;
  /** The identity the media backend knows this member by. */
  id: string;
  userId: string;
  deviceId: string;
  membership$: Behavior<CallMembership>;
  displayName$: Behavior<string>;
  avatarUrl$: Behavior<string | undefined>;
  /** Which transport this member is on; undefined when the membership has none. */
  transport$: Behavior<TransportMetadata | undefined>;
  /**
   * Null while the member has a transport but no media has arrived on it yet
   * ("waiting for media").
   */
  media$: Behavior<MemberMedia | null>;
}

export interface RemoteRtcMember extends RtcMember {
  local: false;
}

export interface LocalRtcMember extends RtcMember {
  local: true;
  media$: Behavior<LocalMemberMedia | null>;
  sharingScreen$: Behavior<boolean>;
  /** Null when the platform cannot share a screen. */
  toggleScreenSharing: (() => void) | null;
  screenShareError$: Behavior<Error | null>;
  dismissScreenShareError(): void;
}

// ---------------------------------------------------------------------------
// Media

export type MediaSource =
  | "microphone"
  | "camera"
  | "screenShare"
  | "screenShareAudio";

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
  /** Route playback through Web Audio, for earpiece pan and gain. Undefined resets. */
  setAudioContext(ctx: AudioContext | undefined, plugins?: AudioNode[]): void;
  setVolume(volume: number): void;
}

export interface VideoMediaTrack extends MediaTrack {
  kind: "video";
  /** Undefined for remote tracks. */
  facingMode$?: Behavior<"user" | "environment" | undefined>;
}

export type EncryptionError = "MissingKey" | "InvalidKey";

/**
 * The media of one member, backed by a LiveKit participant inside the SDK.
 * There is no identity field: the LiveKit identity is the member's `id`.
 */
export interface MemberMedia {
  local: boolean;
  speaking$: Behavior<boolean>;
  screenShareEnabled$: Behavior<boolean>;

  microphone$: Behavior<AudioMediaTrack | undefined>;
  camera$: Behavior<VideoMediaTrack | undefined>;
  screenShare$: Behavior<VideoMediaTrack | undefined>;
  screenShareAudio$: Behavior<AudioMediaTrack | undefined>;

  /** Emits when the SFU reports a key problem for this member. */
  encryptionError$: Observable<EncryptionError>;
}

export interface LocalMemberMedia extends MemberMedia {
  local: true;
}
