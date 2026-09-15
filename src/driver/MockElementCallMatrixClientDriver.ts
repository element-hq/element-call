/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * An {@link ElementCallMatrixClientDriver} whose room lives in memory, for
 * tests and stories: room info, members, a timeline and a profile, with
 * setters that notify subscribers, and a record of what was sent.
 */

import {
  type DriverCapabilities,
  type ElementCallMatrixClientDriver,
  type OwnProfile,
  type RoomInfo,
  type RoomMemberProfile,
  type TimelineEvent,
  type Unsubscribe,
} from "./ElementCallMatrixClientDriver";
import {
  MOCK_OWN_DEVICE_ID,
  MOCK_OWN_USER_ID,
  MOCK_ROOM_ID,
} from "./MockRtcMatrixDriver";

export type ClientCall =
  | {
      kind: "sendRoomEvent";
      eventType: string;
      content: Record<string, unknown>;
      eventId: string;
    }
  | { kind: "redactEvent"; eventId: string };

export interface MockElementCallMatrixClientDriverOptions {
  userId?: string;
  deviceId?: string;
  roomId?: string;
  roomInfo?: Partial<RoomInfo>;
  members?: RoomMemberProfile[];
  ownProfile?: Partial<OwnProfile>;
  capabilities?: Partial<DriverCapabilities>;
}

export class MockElementCallMatrixClientDriver implements ElementCallMatrixClientDriver {
  public readonly userId: string;
  public readonly deviceId: string;
  public readonly roomId: string;
  public readonly outbound: ClientCall[] = [];

  private capabilities: DriverCapabilities;
  private roomInfo: RoomInfo;
  private members: RoomMemberProfile[];
  private ownProfile: OwnProfile;
  private readonly timeline: TimelineEvent[] = [];

  private readonly roomInfoListeners = new Set<(info: RoomInfo) => void>();
  private readonly memberListeners = new Set<
    (members: RoomMemberProfile[]) => void
  >();
  private readonly timelineListeners = new Set<
    (event: TimelineEvent) => void
  >();
  private readonly profileListeners = new Set<(profile: OwnProfile) => void>();
  private nextEventId = 0;

  public constructor(options: MockElementCallMatrixClientDriverOptions = {}) {
    this.userId = options.userId ?? MOCK_OWN_USER_ID;
    this.deviceId = options.deviceId ?? MOCK_OWN_DEVICE_ID;
    this.roomId = options.roomId ?? MOCK_ROOM_ID;
    this.capabilities = {
      stickyEvents: true,
      verifiedEventOrigins: true,
      crossSigningVerdicts: true,
      ...options.capabilities,
    };
    this.roomInfo = {
      name: "Test room",
      canonicalAlias: null,
      avatarUrl: null,
      joinRule: "public",
      encrypted: false,
      canOpenSlot: true,
      ...options.roomInfo,
    };
    this.members = options.members ?? [];
    this.ownProfile = {
      displayName: "Me",
      avatarUrl: null,
      ...options.ownProfile,
    };
  }

  public calls<K extends ClientCall["kind"]>(
    kind: K,
  ): Extract<ClientCall, { kind: K }>[] {
    return this.outbound.filter((c) => c.kind === kind) as Extract<
      ClientCall,
      { kind: K }
    >[];
  }

  // --- room ------------------------------------------------------------------

  public getRoomInfo(): RoomInfo {
    return this.roomInfo;
  }

  public subscribeRoomInfo(listener: (info: RoomInfo) => void): Unsubscribe {
    return listen(this.roomInfoListeners, listener);
  }

  public setRoomInfo(info: Partial<RoomInfo>): void {
    this.roomInfo = { ...this.roomInfo, ...info };
    for (const l of this.roomInfoListeners) l(this.roomInfo);
  }

  public getRoomMembers(): RoomMemberProfile[] {
    return this.members;
  }

  public subscribeRoomMembers(
    listener: (members: RoomMemberProfile[]) => void,
  ): Unsubscribe {
    return listen(this.memberListeners, listener);
  }

  public setRoomMembers(members: RoomMemberProfile[]): void {
    this.members = members;
    for (const l of this.memberListeners) l(members);
  }

  // --- timeline --------------------------------------------------------------

  public async sendRoomEvent(
    eventType: string,
    content: Record<string, unknown>,
  ): Promise<{ eventId: string }> {
    const eventId = `$echo-${this.nextEventId++}`;
    this.outbound.push({ kind: "sendRoomEvent", eventType, content, eventId });
    // Like sync, the room sees our event once the server has it.
    this.emitTimelineEvent({
      eventId,
      type: eventType,
      sender: this.userId,
      content,
      originServerTs: Date.now(),
    });
    return Promise.resolve({ eventId });
  }

  public async redactEvent(eventId: string): Promise<void> {
    this.outbound.push({ kind: "redactEvent", eventId });
    this.emitTimelineEvent({
      eventId: `$echo-${this.nextEventId++}`,
      type: "m.room.redaction",
      sender: this.userId,
      content: { redacts: eventId },
      originServerTs: Date.now(),
      redacts: eventId,
    });
    return Promise.resolve();
  }

  public subscribeTimeline(
    listener: (event: TimelineEvent) => void,
  ): Unsubscribe {
    return listen(this.timelineListeners, listener);
  }

  /** A room event arrives from another user (or is echoed back). */
  public emitTimelineEvent(event: TimelineEvent): void {
    this.timeline.push(event);
    for (const l of this.timelineListeners) l(event);
  }

  public getRelatedEvents(
    eventId: string,
    relType: string,
    eventType: string,
  ): TimelineEvent[] {
    const redacted = new Set(
      this.timeline.flatMap((e) => (e.redacts ? [e.redacts] : [])),
    );
    return this.timeline.filter((e) => {
      if (e.type !== eventType || redacted.has(e.eventId)) return false;
      const relation = e.content["m.relates_to"] as
        | { rel_type?: string; event_id?: string }
        | undefined;
      return relation?.rel_type === relType && relation.event_id === eventId;
    });
  }

  // --- profile, media, capabilities --------------------------------------------

  public getOwnProfile(): OwnProfile {
    return this.ownProfile;
  }

  public subscribeOwnProfile(
    listener: (profile: OwnProfile) => void,
  ): Unsubscribe {
    return listen(this.profileListeners, listener);
  }

  public setOwnProfile(profile: Partial<OwnProfile>): void {
    this.ownProfile = { ...this.ownProfile, ...profile };
    for (const l of this.profileListeners) l(this.ownProfile);
  }

  public async setDisplayName(name: string): Promise<void> {
    this.setOwnProfile({ displayName: name });
    return Promise.resolve();
  }

  public async thumbnailUrl(
    mxcUrl: string,
    width: number,
    height: number,
    _resizeMethod: "crop" | "scale",
  ): Promise<string | null> {
    return Promise.resolve(
      mxcUrl.startsWith("mxc://")
        ? `https://media.example.org/thumbnail/${mxcUrl.slice("mxc://".length)}?width=${width}&height=${height}`
        : null,
    );
  }

  public async getCapabilities(): Promise<DriverCapabilities> {
    return Promise.resolve(this.capabilities);
  }

  public setCapabilities(capabilities: Partial<DriverCapabilities>): void {
    this.capabilities = { ...this.capabilities, ...capabilities };
  }
}

function listen<T>(listeners: Set<T>, listener: T): Unsubscribe {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}
