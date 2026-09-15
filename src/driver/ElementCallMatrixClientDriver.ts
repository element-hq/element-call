/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * What Element Call needs from a Matrix client beyond MatrixRTC.
 *
 * A host implements this once per room next to its {@link RtcMatrixDriver}.
 * It covers what the crate deliberately leaves to the application: who is
 * in the room and what they are called, sending a reaction, showing an
 * avatar, the user's own profile, and what the deployment can do. Homeserver
 * connectivity is *not* here: the crate needs it too, so it is part of the
 * RTC driver and reaches Element Call as a participation impairment.
 *
 * Deliberately framework-neutral: plain values, promises and
 * `subscribeX(listener)` pairs that return an unsubscribe function, the
 * same shape as the crate's sinks. No RxJS crosses this boundary; Element
 * Call wraps subscriptions into behaviors itself (see `observe.ts`).
 */

/** Removes the listener it was returned for. */
export type Unsubscribe = () => void;

export interface DriverCapabilities {
  /** The homeserver accepts sticky events (MSC4354). */
  stickyEvents: boolean;
  /**
   * The events the RTC driver emits carry real decryption metadata. A
   * widget client receives events already decrypted by its host and can
   * only report the device the content *claims*.
   */
  verifiedEventOrigins: boolean;
  /** The RTC driver can say whether a sending device is cross-signed (MSC4153). */
  crossSigningVerdicts: boolean;
}

export interface RoomInfo {
  name: string;
  canonicalAlias: string | null;
  /** An `mxc://` URL. */
  avatarUrl: string | null;
  /** The `m.room.join_rules` value, `null` while unknown. */
  joinRule: string | null;
  /** Whether the room has an `m.room.encryption` state event. */
  encrypted: boolean;
  /**
   * Whether this user may send the MatrixRTC slot state event
   * (`org.matrix.msc4143.rtc.slot`). A call needs an open slot; the client
   * that starts a call opens one, which takes the power level for it.
   */
  canOpenSlot: boolean;
}

export interface RoomMemberProfile {
  userId: string;
  displayName: string | null;
  /** An `mxc://` URL. */
  avatarUrl: string | null;
  membership: "join" | "invite";
}

/**
 * Room metadata and the profiles of the people in it.
 *
 * Call members' names and avatars do not come from here: the crate reads
 * `m.room.member` itself and puts them on each membership. This roster is
 * for the people who are in the room but not (yet) in the call — the person
 * being rung, and how many others there are.
 */
export interface RoomDriver {
  getRoomInfo(): RoomInfo;
  subscribeRoomInfo(listener: (info: RoomInfo) => void): Unsubscribe;
  /** Joined and invited members of the room, in or out of the call. */
  getRoomMembers(): RoomMemberProfile[];
  subscribeRoomMembers(
    listener: (members: RoomMemberProfile[]) => void,
  ): Unsubscribe;
}

/** A decrypted room event, as far as a call needs to know it. */
export interface TimelineEvent {
  eventId: string;
  type: string;
  sender: string;
  content: Record<string, unknown>;
  originServerTs: number;
  /** Set on an `m.room.redaction`. */
  redacts?: string;
}

/** Application events in the room: reactions, hand raises, notifications. */
export interface TimelineDriver {
  sendRoomEvent(
    eventType: string,
    content: Record<string, unknown>,
  ): Promise<{ eventId: string }>;
  redactEvent(eventId: string): Promise<void>;
  /**
   * Live room events (not sticky ones — those reach the crate through its
   * own sink), decrypted, redactions included, local echoes excluded.
   */
  subscribeTimeline(listener: (event: TimelineEvent) => void): Unsubscribe;
  /**
   * Events already known that relate to `eventId` with the given relation
   * type and event type — how a late joiner learns of a raised hand.
   */
  getRelatedEvents(
    eventId: string,
    relType: string,
    eventType: string,
  ): TimelineEvent[];
}

export interface OwnProfile {
  displayName: string | null;
  /** An `mxc://` URL. */
  avatarUrl: string | null;
}

/** The user's own profile. Editing is optional: a host may not allow it. */
export interface ProfileDriver {
  getOwnProfile(): OwnProfile;
  subscribeOwnProfile(listener: (profile: OwnProfile) => void): Unsubscribe;
  setDisplayName?(name: string): Promise<void>;
  setAvatar?(file: Blob): Promise<void>;
}

export interface MediaDriver {
  /**
   * A URL an `<img>` can show for an `mxc://` thumbnail — possibly a `blob:`
   * URL the driver fetched with its credentials — or null when the media
   * cannot be resolved.
   */
  thumbnailUrl(
    mxcUrl: string,
    width: number,
    height: number,
    resizeMethod: "crop" | "scale",
  ): Promise<string | null>;
}

/**
 * Everything Element Call asks of a Matrix client beyond MatrixRTC, bound to
 * one room. One object, sliced into the capabilities above the way the crate
 * slices its own driver, so a piece of Element Call can ask for no more than
 * it needs.
 */
export interface ElementCallMatrixClientDriver
  extends RoomDriver, TimelineDriver, ProfileDriver, MediaDriver {
  /** Who we publish as. */
  readonly userId: string;
  readonly deviceId: string;
  /** The room this driver is bound to. */
  readonly roomId: string;
  getCapabilities(): Promise<DriverCapabilities>;
  /** Free-form facts for a rageshake: crypto version, sync state, and so on. */
  getDiagnostics?(): Promise<Record<string, string>>;
}
