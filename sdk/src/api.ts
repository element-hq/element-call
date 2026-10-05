/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The public types of the SDK. `createMatrixRTCClient` in `MatrixRTCClient.ts`
 * is the only way to obtain an implementation of them.
 */

import {
  type CallMembership,
  type RTCNotificationType,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  type Track,
  type TrackProcessor,
  type VideoCodec,
} from "livekit-client";
import { type Observable } from "rxjs";

import { type Behavior } from "./reactive/Behavior";
import { type MediaBackendFactory } from "./media-backend/api";
import { type EncryptionSystem } from "./encryption";
import {
  type MatrixRTCMode,
  type MediaQuality,
  type SessionTimings,
} from "./config";

// ---------------------------------------------------------------------------
// MatrixRTCClient

export interface MatrixRTCClientOptions {
  encryptionSystem: EncryptionSystem;
  /** Resolved by the host; the SDK reads neither config.json nor settings. */
  matrixRTCMode: MatrixRTCMode;
  /** Published at the join; `publish` on the local member adds to it from then on. */
  publish: PublishRequest[];
  /**
   * MSC4075 notification sent with the join. A parameter of the MatrixRTC
   * join itself, so it is here even though it is named after calls; reacting
   * to a notification (ringing, timeouts, declines) is the application's job.
   */
  sendNotificationType?: RTCNotificationType;
  /** The application the session belongs to, as named in the membership. Default `m.call`. */
  application?: string;
  /** The application's slot in the room. Default `ROOM`. */
  slot?: string;
  /**
   * Whatever the application wants to say about itself in the membership,
   * under namespaced keys. Opaque to the SDK, apart from `m.call.intent`
   * (`"audio"` or `"video"`), which the membership format carries as a
   * field of its own.
   */
  applicationData?: Record<string, unknown>;
  /** Session timings the host has configured; the defaults otherwise. */
  timings?: Partial<SessionTimings>;
  /** Limits on what is published; LiveKit's defaults otherwise. */
  mediaQuality?: MediaQuality;
  /** Use this transport instead of asking the homeserver. */
  transportUrl?: string;
  /** Use this transport when the homeserver advertises none. */
  fallbackTransportUrl?: string;
  /**
   * What carries the media. LiveKit, configured from the options above, when
   * left out; see `createLivekitBackend` for building one with other options.
   */
  backend?: MediaBackendFactory;
}

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

export type ConnectionStatus =
  | "waitingForTransport"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

/** Why the client is not connected: the first failing of its three links. */
export type DisconnectReason = "sync" | "membership" | "probablyLeft" | "media";

import { type MatrixRTCError } from "./errors";

export { MatrixRTCError } from "./errors";

/**
 * A session in one room. The room has to be the one the client's sync loop
 * maintains (`client.getRoom(roomId)`, once the join has synced): the
 * detached copy `joinRoom` returns for a room joined just now never receives
 * the state the members are read from.
 */
export interface MatrixRTCClient {
  join(): void;
  leave(): void;
  /** Collapsed view of the local member's state machine. */
  status$: Behavior<ConnectionStatus>;
  connected$: Behavior<boolean>;
  reconnecting$: Behavior<boolean>;
  /** Null while connected, the first failing link otherwise. */
  disconnectReason$: Behavior<DisconnectReason | null>;

  /** A transport, Matrix or connection error that stops the session. */
  fatalError$: Behavior<MatrixRTCError | null>;

  localMember$: Behavior<LocalRTCMember | null>;
  remoteMembers$: Behavior<RemoteRTCMember[]>;
  /** `remoteMembers.length`, plus one for the local member once it exists. */
  memberCount$: Behavior<number>;

  /**
   * Whether the session has grown large enough that MatrixRTC has stopped
   * rotating the media encryption key.
   */
  keyRotationSuppressed$: Behavior<boolean>;

  /** Transports the session currently holds a live connection to. */
  connectedTransports$: Behavior<TransportMetadata[]>;

  /**
   * Plays the members' audio on this device from now on. Rejects where the
   * browser cannot switch to it. A host that routes audio itself, or leaves
   * the browser's choice, never calls it.
   */
  setAudioOutputDeviceId(deviceId: string): Promise<void>;

  /**
   * Sends a short text to every member on the local transport, over a
   * reliable data channel beside the media. A packet holds about 15 KiB;
   * anything larger belongs in a room event. Rejects while the local
   * transport is not connected. Encrypted on the wire like the media, but
   * not end to end with the media key.
   */
  sendData(topic: string, text: string): Promise<void>;
  /**
   * What remote members sent with `sendData`, on every transport the client
   * is connected to. A message from an identity that is not a member is
   * dropped, so a host only ever hears from attested members.
   */
  data$: Observable<DataMessage>;
}

/** One `sendData` call as it arrives at a remote member. */
export interface DataMessage {
  member: RemoteRTCMember;
  topic: string;
  text: string;
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
  /** Stable key, unique per transport in the session: the raw transport, serialised with sorted keys. */
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

/**
 * What a membership says, as hosts read it. The js-sdk `CallMembership` is
 * behind it; anything beyond this is the js-sdk's API, not the SDK's.
 */
export type RTCMembership = Pick<
  CallMembership,
  | "userId"
  | "deviceId"
  | "memberId"
  | "rtcBackendIdentity"
  | "application"
  | "applicationData"
  | "getTransport"
  | "transports"
  | "createdTs"
  | "getAbsoluteExpiry"
>;

export interface RTCMember {
  local: boolean;
  /** The identity the media backend knows this member by. */
  id: string;
  userId: string;
  deviceId: string;
  membership$: Behavior<RTCMembership>;
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

export interface RemoteRTCMember extends RTCMember {
  local: false;
}

export interface LocalRTCMember extends RTCMember {
  local: true;
  media$: Behavior<LocalMemberMedia | null>;
  /**
   * Publishes a source and resolves with its track once it is in `tracks$`.
   * Before the transport is connected the request is remembered and applied
   * once it is. Rejects where the device could not be used, including the
   * user closing the picker. One publication per source: publishing a source
   * again unmutes it.
   */
  publish(
    request: PublishRequest,
  ): Promise<LocalAudioMediaTrack | LocalVideoMediaTrack>;
  /** Removes one of our tracks; a screen share takes its audio with it. */
  unpublish(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Media

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
