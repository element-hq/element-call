/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The public types of the SDK: the client, its members and transports. What a
 * member sends is in `media-api.ts`. `createMatrixRTCClient` in
 * `MatrixRTCClient.ts` is the only way to obtain an implementation of them.
 */

import {
  type CallMembership,
  type RTCNotificationType,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { type Observable } from "rxjs";

import { type Behavior } from "./reactive/Behavior";
import {
  type AudioMediaTrack,
  type EncryptionError,
  type LocalAudioMediaTrack,
  type LocalVideoMediaTrack,
  type PublishRequest,
  type VideoMediaTrack,
} from "./media-api";
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
   * The member's tracks, in publication order, once it has shown up on its
   * transport; null until then ("waiting for media"). An entry stays the same
   * object for as long as the same publication is behind it. Which track is
   * which is in its `source`; `trackBySource$` picks one out.
   */
  tracks$: Behavior<(AudioMediaTrack | VideoMediaTrack)[] | null>;
  /** Emits when the SFU reports a key problem for this member. */
  encryptionError$: Observable<EncryptionError>;
}

export interface RemoteRTCMember extends RTCMember {
  local: false;
}

export interface LocalRTCMember extends RTCMember {
  local: true;
  tracks$: Behavior<(LocalAudioMediaTrack | LocalVideoMediaTrack)[] | null>;
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
