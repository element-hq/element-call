/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * An {@link ElementCallMatrixClientDriver} over a matrix-js-sdk client: room
 * metadata and members, the room's timeline for reactions and notifications,
 * the user's own profile, authenticated thumbnails and capability probes.
 * Works on a full `MatrixClient` and on a `RoomWidgetClient`; the places
 * they differ are marked "widget".
 */

import {
  KnownMembership,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  RoomEvent,
  type RoomMember,
  RoomStateEvent,
  RoomWidgetClient,
  UNSTABLE_MSC4354_STICKY_EVENTS,
  type User,
  UserEvent,
} from "matrix-js-sdk";
import { logger as rootLogger, type Logger } from "matrix-js-sdk/lib/logger";

import { ELEMENT_CALL_SLOT_EVENT_TYPE } from "../../state/rtc/slot";
import {
  type DriverCapabilities,
  type ElementCallMatrixClientDriver,
  type OwnProfile,
  type RoomInfo,
  type RoomMemberProfile,
  type TimelineEvent,
  type Unsubscribe,
} from "../ElementCallMatrixClientDriver";

/** The state event types `getRoomInfo()` is computed from. */
const ROOM_INFO_EVENT_TYPES = new Set([
  "m.room.name",
  "m.room.avatar",
  "m.room.canonical_alias",
  "m.room.join_rules",
  "m.room.encryption",
  "m.room.power_levels",
]);

export interface JsSdkElementCallMatrixClientDriverOptions {
  logger?: Logger;
}

export class JsSdkElementCallMatrixClientDriver implements ElementCallMatrixClientDriver {
  public readonly userId: string;
  public readonly deviceId: string;
  public readonly roomId: string;

  private readonly logger: Logger;
  /** Widget: no crypto backend, no access token, events without metadata. */
  private readonly widget: boolean;
  private capabilities: Promise<DriverCapabilities> | null = null;

  public constructor(
    private readonly client: MatrixClient,
    private readonly room: Room,
    options: JsSdkElementCallMatrixClientDriverOptions = {},
  ) {
    const userId = client.getUserId();
    const deviceId = client.getDeviceId();
    if (userId === null || deviceId === null)
      throw new Error(
        "The client must be logged in before it can drive a call",
      );
    this.userId = userId;
    this.deviceId = deviceId;
    this.roomId = room.roomId;
    this.widget = client instanceof RoomWidgetClient;
    this.logger = (options.logger ?? rootLogger).getChild(
      `[JsSdkElementCallMatrixClientDriver ${room.roomId}]`,
    );
  }

  // --- room ------------------------------------------------------------------

  public getRoomInfo(): RoomInfo {
    return {
      name: this.room.name,
      canonicalAlias: this.room.getCanonicalAlias(),
      avatarUrl: this.room.getMxcAvatarUrl(),
      joinRule: this.room.currentState.getJoinRule() ?? null,
      encrypted: this.room.hasEncryptionStateEvent(),
      canOpenSlot: this.room.currentState.maySendStateEvent(
        ELEMENT_CALL_SLOT_EVENT_TYPE,
        this.userId,
      ),
    };
  }

  public subscribeRoomInfo(listener: (info: RoomInfo) => void): Unsubscribe {
    const notify = (): void => listener(this.getRoomInfo());
    const onState = (event: MatrixEvent): void => {
      if (
        event.getRoomId() === this.roomId &&
        ROOM_INFO_EVENT_TYPES.has(event.getType())
      )
        notify();
    };
    this.room.on(RoomEvent.Name, notify);
    this.client.on(RoomStateEvent.Events, onState);
    return (): void => {
      this.room.off(RoomEvent.Name, notify);
      this.client.off(RoomStateEvent.Events, onState);
    };
  }

  public getRoomMembers(): RoomMemberProfile[] {
    const profile =
      (membership: "join" | "invite") =>
      (member: RoomMember): RoomMemberProfile => ({
        userId: member.userId,
        displayName: member.rawDisplayName ?? null,
        avatarUrl: member.getMxcAvatarUrl() ?? null,
        membership,
      });
    return [
      ...this.room
        .getMembersWithMembership(KnownMembership.Join)
        .map(profile("join")),
      ...this.room
        .getMembersWithMembership(KnownMembership.Invite)
        .map(profile("invite")),
    ];
  }

  public subscribeRoomMembers(
    listener: (members: RoomMemberProfile[]) => void,
  ): Unsubscribe {
    const onMembers = (event: MatrixEvent): void => {
      if (event.getRoomId() === this.roomId) listener(this.getRoomMembers());
    };
    this.client.on(RoomStateEvent.Members, onMembers);
    return (): void => {
      this.client.off(RoomStateEvent.Members, onMembers);
    };
  }

  // --- timeline ----------------------------------------------------------------

  public async sendRoomEvent(
    eventType: string,
    content: Record<string, unknown>,
  ): Promise<{ eventId: string }> {
    const res = await this.client.sendEvent(
      this.roomId,
      eventType as never,
      content as never,
    );
    return { eventId: res.event_id };
  }

  public async redactEvent(eventId: string): Promise<void> {
    await this.client.redactEvent(this.roomId, eventId);
  }

  public subscribeTimeline(
    listener: (event: TimelineEvent) => void,
  ): Unsubscribe {
    // Our own events are seen twice — as the local echo, then as sent —
    // and a redaction is both a timeline event and a Redaction signal.
    const seen = new Set<string>();
    const deliver = async (event: MatrixEvent): Promise<void> => {
      if (event.getRoomId() !== this.roomId) return;
      // Still sending: the LocalEchoUpdated listener gets the real id later.
      if (event.status !== null) return;
      if (event.unstableStickyInfo !== undefined || event.isState()) return;
      const eventId = event.getId();
      const sender = event.getSender();
      if (!eventId || !sender || seen.has(eventId)) return;
      try {
        await this.client.decryptEventIfNeeded(event);
      } catch (e) {
        this.logger.warn(`Could not decrypt ${eventId}`, e);
      }
      if (event.isDecryptionFailure() || seen.has(eventId)) return;
      seen.add(eventId);
      if (seen.size > 1000) seen.delete(seen.values().next().value!);
      listener({
        eventId,
        type: event.getType(),
        sender,
        content: event.getContent(),
        originServerTs: event.getTs(),
        redacts: event.event.redacts,
      });
    };
    const onTimeline = (
      event: MatrixEvent,
      room: Room | undefined,
      toStartOfTimeline: boolean | undefined,
    ): void => {
      if (room?.roomId === this.roomId && !toStartOfTimeline)
        void deliver(event);
    };
    const onEcho = (event: MatrixEvent): void => void deliver(event);
    this.client.on(RoomEvent.Timeline, onTimeline);
    this.room.on(RoomEvent.LocalEchoUpdated, onEcho);
    this.room.on(RoomEvent.Redaction, onEcho);
    return (): void => {
      this.client.off(RoomEvent.Timeline, onTimeline);
      this.room.off(RoomEvent.LocalEchoUpdated, onEcho);
      this.room.off(RoomEvent.Redaction, onEcho);
    };
  }

  public getRelatedEvents(
    eventId: string,
    relType: string,
    eventType: string,
  ): TimelineEvent[] {
    const relations = this.room.relations.getChildEventsForEvent(
      eventId,
      relType as never,
      eventType as never,
    );
    return (relations?.getRelations() ?? [])
      .filter(
        (event) => !event.isRedacted() && event.getId() && event.getSender(),
      )
      .map((event) => ({
        eventId: event.getId()!,
        type: event.getType(),
        sender: event.getSender()!,
        content: event.getContent(),
        originServerTs: event.getTs(),
      }));
  }

  // --- profile -------------------------------------------------------------------

  public getOwnProfile(): OwnProfile {
    const user = this.client.getUser(this.userId);
    return {
      displayName: user?.rawDisplayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
    };
  }

  public subscribeOwnProfile(
    listener: (profile: OwnProfile) => void,
  ): Unsubscribe {
    const user: User | null = this.client.getUser(this.userId);
    if (user === null) return (): void => {};
    const notify = (): void => listener(this.getOwnProfile());
    user.on(UserEvent.DisplayName, notify);
    user.on(UserEvent.AvatarUrl, notify);
    return (): void => {
      user.off(UserEvent.DisplayName, notify);
      user.off(UserEvent.AvatarUrl, notify);
    };
  }

  public async setDisplayName(name: string): Promise<void> {
    await this.client.setDisplayName(name);
  }

  public async setAvatar(file: Blob): Promise<void> {
    const { content_uri: uri } = await this.client.uploadContent(file);
    await this.client.setAvatarUrl(uri);
  }

  // --- media -----------------------------------------------------------------------

  public async thumbnailUrl(
    mxcUrl: string,
    width: number,
    height: number,
    resizeMethod: "crop" | "scale",
  ): Promise<string | null> {
    const httpUrl = this.client.mxcUrlToHttp(
      mxcUrl,
      width,
      height,
      resizeMethod,
      false,
      true,
      true,
    );
    // Widget: no token of our own; the host bridge downloads media instead.
    const token = this.client.getAccessToken();
    if (httpUrl === null || token === null) return null;
    const response = await fetch(httpUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return URL.createObjectURL(await response.blob());
  }

  // --- capabilities and diagnostics ------------------------------------------------

  public async getCapabilities(): Promise<DriverCapabilities> {
    this.capabilities ??= this.probeCapabilities();
    return this.capabilities;
  }

  private async probeCapabilities(): Promise<DriverCapabilities> {
    const stickyEvents = await this.client
      .doesServerSupportUnstableFeature(UNSTABLE_MSC4354_STICKY_EVENTS)
      .catch((e: unknown) => {
        this.logger.warn("Could not probe sticky event support", e);
        return false;
      });
    return {
      stickyEvents,
      verifiedEventOrigins: !this.widget,
      crossSigningVerdicts: this.client.getCrypto() !== undefined,
    };
  }

  public async getDiagnostics(): Promise<Record<string, string>> {
    return Promise.resolve({
      matrix_backend: this.widget ? "widget" : "jssdk",
      crypto_version: this.client.getCrypto()?.getVersion() ?? "none",
      sync_state: String(this.client.getSyncState()),
    });
  }
}
