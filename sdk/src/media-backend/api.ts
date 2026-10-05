/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The seam between the session and whatever carries its media. The session
 * speaks MatrixRTC: memberships, transports as they appear in them, the
 * delayed leave. A backend speaks one media protocol and hands back the
 * media of each member. `backend/livekit/` is the one backend today.
 */

import { type Logger } from "matrix-js-sdk/lib/logger";
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { type Observable } from "rxjs";

import {
  type LocalRTCMember,
  type ResolvedTransport,
  type RTCMember,
  type RTCMembership,
} from "../api";
import {
  type LocalAudioMediaTrack,
  type LocalVideoMediaTrack,
  type PublishRequest,
} from "../media-api";
import { type SessionTimings } from "../config";
import { type EncryptionSystem } from "../encryption";
import { type Behavior } from "../reactive/Behavior";
import { type ObservableScope } from "../reactive/ObservableScope";

export enum MediaConnectionState {
  /** No connection attempt yet, or no connection at all. */
  Initialized = "initialized",
  /** Fetching whatever the connection needs first; the SFU token for LiveKit. */
  Preparing = "preparing",
  Connecting = "connecting",
  Connected = "connected",
  Reconnecting = "reconnecting",
  Disconnected = "disconnected",
  Stopped = "stopped",
}

/** One per-participant media key, as the session's key exchange delivers it. */
export interface MediaKey {
  /** The `rtcBackendIdentity` of the member the key belongs to. */
  participantId: string;
  index: number;
  key: Uint8Array<ArrayBuffer>;
}

/** The fields of a member the backend supplies, as the member exposes them. */
export type MemberMediaFields = Pick<RTCMember, "tracks$" | "encryptionError$">;
export type LocalMemberMediaFields = Pick<
  LocalRTCMember,
  "tracks$" | "encryptionError$"
>;

export interface MediaBackendContext {
  roomId: string;
  ownMembershipIdentity: CallMembershipIdentityParts;
  /** What the local member publishes at the join. */
  publish: PublishRequest[];
  encryptionSystem: EncryptionSystem;
  /**
   * Every media key the session knows: the current ones replayed on
   * subscribe, new ones as they arrive. Empty for a shared key, which is in
   * `encryptionSystem`.
   */
  mediaKeys$: Observable<MediaKey>;
  timings: SessionTimings;
  logger: Logger;
}

/**
 * The type of the `backend` option: the session calls it once with its scope
 * and the context. A backend's own factory keeps the shape of every other
 * factory here, `createLivekitBackend(scope, context, options)`, and a host
 * closes over its options. The Matrix client is not in the context: a backend
 * that needs it takes a `Pick` of exactly what it calls in its own options.
 */
export type MediaBackendFactory = (
  scope: ObservableScope,
  context: MediaBackendContext,
) => MediaBackend;

/** What preparing the local transport established; what the MatrixRTC join needs from the media side. */
export interface TransportCapabilities {
  /**
   * Whether the backend can restart the delayed leave on the client's behalf,
   * so that a client that vanishes is removed by the backend rather than by
   * the timeout. Decides which delayed leave timings the join uses, and
   * whether `delegateDelayedLeave` is ever called.
   */
  canDelegateDelayedLeave: boolean;
}

/** One connection a backend holds, for diagnostics. */
export interface BackendConnection {
  /** The transport as it appears in memberships; what the registry keys on. */
  transport: Transport;
  state: MediaConnectionState | Error;
  /**
   * What the backend fetched to connect; undefined until it has, and again
   * after the connection stops. One object per fetch, so that a change of
   * state does not read as a change of this.
   */
  resolved: ResolvedTransport | undefined;
}

export interface DataPacket {
  /** The backend identity of the sender. */
  senderId: string;
  topic: string;
  text: string;
}

export interface MediaBackend {
  /** The membership transport type this backend serves: "livekit". */
  readonly transportType: string;

  /**
   * Makes `transport` usable as the one the local member publishes on. The
   * session found it; the backend does whatever has to succeed before it is
   * advertised in the membership. Rejects with the error the session reports
   * as fatal. Called once per session.
   */
  prepareLocalTransport(transport: Transport): Promise<TransportCapabilities>;

  /**
   * Hands the delayed leave event to the backend, which restarts it from
   * then on. Called each time the membership manager reports a new delay id,
   * only when `canDelegateDelayedLeave` is true. A rejection is logged by
   * the session, not fatal.
   */
  delegateDelayedLeave(delayId: string): Promise<void>;

  readonly local: LocalMediaBackend;

  /**
   * The media of one remote member: its tracks, null while nothing has
   * arrived for it on its transport, and its key errors. Built in `scope`,
   * which the caller ends with the member. This is also how the backend
   * learns which remote transports exist: it follows the membership's
   * transport for as long as `scope` lives, and connects to every transport
   * some member is on.
   */
  mediaFor$(
    scope: ObservableScope,
    membership$: Behavior<RTCMembership>,
  ): MemberMediaFields;

  /** Every connection the backend holds. For debugging and devtool purposes.*/
  readonly connections$: Behavior<BackendConnection[]>;

  /** Plays the members' audio on this device, on the connections of now and later. */
  setAudioOutputDeviceId(deviceId: string): Promise<void>;

  /**
   * A text channel beside the media: sent on the local transport, received on every one.
   * This could well be just another track kind. Not needed for element call. just for the sdk target.
   * Keeping it on the top level for visibility. Should be tackled in a future refactor.
   */
  sendData(topic: string, text: string): Promise<void>;
  readonly data$: Observable<DataPacket>;
}

/** `tracks$` is null until the connection carries a local participant. */
export interface LocalMediaBackend extends LocalMemberMediaFields {
  /**
   * State of the connection the local member publishes on. `Initialized`
   * while there is none; an `Error` is the connection's failure.
   */
  readonly connectionState$: Behavior<MediaConnectionState | Error>;

  /**
   * Whether the local tracks reach the transport. The session sets it to
   * "joined and the homeserver is reachable". Remembered across connections:
   * the tracks are created on the first `true`, and their upstream is paused
   * while `false`, so the local preview stays live while nothing is heard.
   */
  setPublishing(publish: boolean): void;
  /** The first failure to publish, kept until the session ends. Not fatal. */
  readonly publishError$: Behavior<Error | null>;

  /**
   * Publishes a source and resolves with its track once it is in `tracks$`.
   * Remembered across connections, so a request before the
   * transport is up is applied once it is, and republished after a
   * reconnection. Rejects where the device could not be used.
   */
  publish(
    request: PublishRequest,
  ): Promise<LocalAudioMediaTrack | LocalVideoMediaTrack>;
  /** Removes one of our tracks by id; a screen share takes its audio with it. */
  unpublish(id: string): Promise<void>;
}
