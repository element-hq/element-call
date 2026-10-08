/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The public types of the SDK: the slot, the participation, their members and
 * transports. What a member sends is in `media-api.ts`. `createRTCSlot` in
 * `RTCSlot.ts` is the only way to obtain an implementation of them.
 */

import {
  type RTCNotificationType,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { type Observable } from "rxjs";

import { type Behavior } from "./reactive/Behavior";
import {
  type LocalAudioMediaTrack,
  type LocalMemberMedia,
  type LocalVideoMediaTrack,
  type MediaSource,
  type MemberMedia,
  type PublishRequest,
} from "./media-api";
import { type MediaBackendFactory } from "./media-backend/api";
import { type EncryptionSystem } from "./encryption";
import {
  type MatrixRTCMode,
  type MediaQuality,
  type SessionTimings,
} from "./config";
import { type MatrixRTCError } from "./errors";

export { MatrixRTCError } from "./errors";

// ---------------------------------------------------------------------------
// Slot

export interface RTCSlotOptions {
  /** The application the slot belongs to, as named in the membership. Default `m.call`. */
  application?: string;
  /** The application's slot in the room. Default `ROOM`. */
  id?: string;
  /** How memberships and keys in this slot are written. Resolved by the host. */
  matrixRTCMode: MatrixRTCMode;
  encryptionSystem: EncryptionSystem;
}

/**
 * The namespace in a room that memberships join into. It exists while the
 * room does, with nobody in it too. The room has to be the one the client's
 * sync loop maintains (`client.getRoom(roomId)`, once the join has synced):
 * the detached copy `joinRoom` returns for a room joined just now never
 * receives the state the members are read from.
 */
export interface RTCSlot {
  readonly roomId: string;
  readonly application: string;
  readonly id: string;
  /** From the slot state event; undefined while the room has none. */
  status$: Behavior<"open" | "closed" | undefined>;
  /**
   * Everyone in the slot, one object per membership, kept for as long as the
   * membership is. Our own membership is in here too, with `local: true`,
   * once the room has seen it. No media: that is the participation's.
   */
  members$: Behavior<RTCMember[]>;
  /** The participation we are in, null between `leave()` and the next `join()`. */
  participation$: Behavior<RTCParticipation | null>;
  /**
   * Joins the slot and returns the participation that lasts until its
   * `leave()`. Throws while `participation$` is not null: a slot has one local
   * member.
   */
  join(options: RTCParticipationOptions): RTCParticipation; // Maybe MediaSession,
}

// ---------------------------------------------------------------------------
// Participation

export interface RTCParticipationOptions {
  /**
   * Published at the join; `publish` on the participation adds to it from then
   * on. Kept as an option, rather than only the method, because the LiveKit
   * backend reads the initial requests to build the room's default capture
   * options before the first connection exists.
   */
  publish: PublishRequest[];
  /**
   * LEGACY
   *
   * Conside already removing it. just skips code in js-sdk. But rust sdk will not have this feature.
   * MSC4075 notification sent with the join. A parameter of the MatrixRTC
   * join itself, so it is here even though it is named after calls; reacting
   * to a notification (ringing, timeouts, declines) is the application's job.
   */
  sendNotificationType?: RTCNotificationType;
  /**
   * Whatever the application wants to say about itself in the membership,
   * under namespaced keys. Opaque to the SDK, apart from `m.call.intent`
   * (`"audio"` or `"video"`), which the membership format carries as a
   * field of its own.
   */
  applicationData?: Record<string, unknown>;
  /** Timings the host has configured; the defaults otherwise. */
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

export type ParticipationStatus =
  | "waitingForTransport"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  /** `leave()` was called; the participation is over and stays so. */
  | "left";

/** Why the participation is not connected: the first failing of its three links. */
export type DisconnectReason = "sync" | "membership" | "probablyLeft" | "media";

/** The span between our `join()` of a slot and our `leave()`. */
export interface RTCParticipation {
  readonly slot: RTCSlot;
  /** Sends the leave, tears the connections down and ends the participation. */
  leave(): void;
  /** Collapsed view of the local member's state machine. */
  status$: Behavior<ParticipationStatus>;
  connected$: Behavior<boolean>;
  reconnecting$: Behavior<boolean>;
  /** Null while connected, the first failing link otherwise. */
  disconnectReason$: Behavior<DisconnectReason | null>;
  /** A transport, Matrix or connection error that stops the participation. */
  fatalError$: Behavior<MatrixRTCError | null>;

  /** Null until our own membership has been seen in the room. */
  localMember$: Behavior<LocalRTCMember | null>;
  /**
   * The slot's other members, each with the media this participation carries
   * for it. A call view needs nothing but this and `localMember$` to render.
   */
  remoteMembers$: Behavior<RemoteRTCMember[]>;

  /**
   * Publishes a source and resolves with its track, which also shows up in
   * `localMember$.tracks$`. Works from the moment `join()` returns: before the
   * transport is connected.
   */
  publish(
    request: PublishRequest,
  ): Promise<LocalAudioMediaTrack | LocalVideoMediaTrack>;
  /** Removes one of our publications; a screen share takes its audio with it. */
  unpublish(source: MediaSource): Promise<void>;

  /**
   * Whether the slot has grown large enough that MatrixRTC has stopped
   * rotating the media encryption key.
   */
  keyRotationSuppressed$: Behavior<boolean>;

  /** Transports the participation currently holds a live connection to. */
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
   * What remote members sent with `sendData`, on every transport the
   * participation is connected to. A message from an identity that is not a
   * member is dropped, so a host only ever hears from attested members.
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
  /** Stable key, unique per transport in the slot: the raw transport, serialised with sorted keys. */
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

/** A membership in the slot, with what the SDK derives from it. No media. */
export interface RTCMember {
  local: boolean;
  /**
   * The identity this member has on the media backend's transport: the
   * participant identity the SFU sees, and the sender of its data packets. The
   * SDK uses it to match what arrives on the transport back to the member; a
   * host needs it only as a stable key per membership or as a debug label.
   *
   * Today it is read off the membership, where the js-sdk computes it:
   * `${userId}:${deviceId}` before sticky events, a hash of `memberId` in
   * Matrix 2.0 mode. Eventually the backend will derive it itself, so treat it
   * as opaque.
   */
  rtcBackendIdentity: string;
  userId: string;
  deviceId: string;
  /** The membership's own id; what the Matrix 2.0 identity is derived from. */
  memberId: string;
  /** Which transport this member is on; undefined when the membership has none. */
  transport$: Behavior<TransportMetadata | undefined>;
  /** What the member's application says about itself, e.g. `m.call.intent`. */
  applicationData$: Behavior<Record<string, unknown>>;

  displayName$: Behavior<string>;
  avatarUrl$: Behavior<string | undefined>;
}

export interface RemoteRTCMember extends RTCMember, MemberMedia {
  local: false;
}

/** Our member: the same as a remote one, with tracks that carry the controls. */
export interface LocalRTCMember extends RTCMember, LocalMemberMedia {
  local: true;
}
