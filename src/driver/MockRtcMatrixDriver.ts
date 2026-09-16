/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * An {@link RtcMatrixDriver} with a homeserver made of arrays, for tests and
 * stories.
 *
 * It models what sync would do: it records every outbound call, echoes
 * accepted sticky and state events back through the room-event sink (so our
 * own membership reaches the roster like anybody else's), answers `readState`
 * from `roomState`, mints tokens, reports homeserver connectivity, and hosts
 * simulated peers that answer our media key with theirs.
 *
 * A port of the crate's `web-test-app/src/mockDriver.ts`, which is the
 * source of truth for the fabricated wire shapes below.
 */

import {
  FfiEventOrigin,
  RtcError,
  type ConnectivitySinkLike,
  type FfiLivekitToken,
  type FfiLivekitTokenRequest,
  type FfiRtcTransport,
  type FfiSendEventResponse,
  type FfiToDeviceDelivery,
  type FfiToDeviceRecipient,
  type FfiHomeserverDelegationRequest,
  type FfiTransportDelegationRequest,
  type RoomEventSinkLike,
  type StateUpdateSinkLike,
  type ToDeviceSinkLike,
} from "../matrix-rtc-sdk";
import { type RtcMatrixDriver } from "./RtcMatrixDriver";

export const MOCK_LK_SERVICE_URL = "https://lk.example.org";
export const MOCK_ROOM_ID = "!room:example.org";
/** MSC4143: a slot id is `{application_type}#{id}`; Element Call's is this. */
export const MOCK_SLOT_ID = "m.call#ROOM";
export const MOCK_OWN_USER_ID = "@me:example.org";
export const MOCK_OWN_DEVICE_ID = "MYDEV";

/** Every call the crate made on the driver, in order. */
export type OutboundCall =
  | {
      kind: "stickyEvent";
      roomId: string;
      eventType: string;
      content: Record<string, unknown>;
      durationMs: bigint;
    }
  | {
      kind: "stateEvent";
      roomId: string;
      eventType: string;
      stateKey: string;
      content: Record<string, unknown>;
    }
  | {
      kind: "delayedEvent";
      roomId: string;
      eventType: string;
      content: Record<string, unknown>;
      delayMs: bigint;
      stickyDurationMs: bigint | undefined;
      delayId: string;
    }
  | {
      kind: "delayedStateEvent";
      roomId: string;
      eventType: string;
      stateKey: string;
      content: Record<string, unknown>;
      delayMs: bigint;
      delayId: string;
    }
  | { kind: "restartDelayed"; roomId: string; delayId: string }
  | { kind: "cancelDelayed"; roomId: string; delayId: string }
  | { kind: "delegateViaHomeserver"; request: FfiHomeserverDelegationRequest }
  | { kind: "delegateViaTransport"; request: FfiTransportDelegationRequest }
  | {
      kind: "toDevice";
      recipients: FfiToDeviceRecipient[];
      eventType: string;
      content: Record<string, unknown>;
    }
  | { kind: "getRtcTransports" }
  | {
      kind: "getLivekitToken";
      url: string;
      roomId: string;
      slotId: string;
      member: Record<string, unknown>;
      legacySfuGet: boolean;
    };

/** A simulated remote participant. */
export interface RemotePeer {
  userId: string;
  deviceId: string;
  memberId: string;
  /** 32 key bytes; defaults to a constant pattern. */
  key?: Uint8Array;
}

/** A raw Matrix event as the crate reads it. */
export type RawEvent = Record<string, unknown>;

export interface MockRtcMatrixDriverOptions {
  userId?: string;
  deviceId?: string;
  roomId?: string;
  /** Room state answered by `readState` (the crate's session seed). */
  roomState?: RawEvent[];
  /** Advertised by `getRtcTransports`; an empty list is "none". */
  transports?: FfiRtcTransport[];
}

export class MockRtcMatrixDriver implements RtcMatrixDriver {
  /** Who this driver publishes as — not part of the contract, handy in tests. */
  public readonly userId: string;
  public readonly deviceId: string;
  public readonly roomId: string;

  public readonly outbound: OutboundCall[] = [];
  /** Refuse delayed events like a homeserver without MSC4140 (404). */
  public refuseDelayedEvents = false;
  /** Refuse sticky events like a homeserver without MSC4354 (404). */
  public refuseStickyEvents = false;
  /** Make `getRtcTransports` fail rather than answer. */
  public failTransportDiscovery = false;
  /** No MSC4195 endpoint on the homeserver: the crate falls back to the service. */
  public refuseHomeserverDelegation = false;
  /** The authorisation service refuses the delegation too. */
  public refuseTransportDelegation = false;
  public roomState: RawEvent[];
  public transports: FfiRtcTransport[];
  /** Simulated peers answer our media key with theirs (index 0). */
  public readonly peers: RemotePeer[] = [];

  private roomEventSink?: RoomEventSinkLike;
  private toDeviceSink?: ToDeviceSinkLike;
  private stateUpdateSink?: StateUpdateSinkLike;
  private connectivitySink?: ConnectivitySinkLike;
  private homeserverConnected = true;

  private nextDelayId = 0;
  private nextEventId = 0;

  public constructor(options: MockRtcMatrixDriverOptions = {}) {
    this.userId = options.userId ?? MOCK_OWN_USER_ID;
    this.deviceId = options.deviceId ?? MOCK_OWN_DEVICE_ID;
    this.roomId = options.roomId ?? MOCK_ROOM_ID;
    this.roomState = options.roomState ?? [];
    this.transports = options.transports ?? [
      {
        transportType: "livekit",
        propertiesJson: JSON.stringify({
          livekit_service_url: MOCK_LK_SERVICE_URL,
        }),
      },
    ];
  }

  // --- assertions ----------------------------------------------------------

  public calls<K extends OutboundCall["kind"]>(
    kind: K,
  ): Extract<OutboundCall, { kind: K }>[] {
    return this.outbound.filter((c) => c.kind === kind) as Extract<
      OutboundCall,
      { kind: K }
    >[];
  }

  // --- outbound --------------------------------------------------------------

  public async sendStickyEvent(
    roomId: string,
    eventType: string,
    contentJson: string,
    durationMs: bigint,
  ): Promise<FfiSendEventResponse> {
    const content = parse(contentJson);
    this.record({
      kind: "stickyEvent",
      roomId,
      eventType,
      content,
      durationMs,
    });
    if (this.refuseStickyEvents)
      throw new RtcError.Unsupported(
        "M_UNRECOGNIZED: sticky events are not supported",
      );
    const eventId = this.eventId();
    // The homeserver echoes our event through sync.
    this.echo(
      {
        type: eventType,
        sender: this.userId,
        event_id: eventId,
        room_id: roomId,
        origin_server_ts: Date.now(),
        msc4354_sticky: { duration_ms: Number(durationMs) },
        content,
      },
      new FfiEventOrigin.Encrypted({ senderDeviceId: this.deviceId }),
    );
    return Promise.resolve({ eventId, delayId: undefined });
  }

  public async sendStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    contentJson: string,
  ): Promise<FfiSendEventResponse> {
    const content = parse(contentJson);
    this.record({ kind: "stateEvent", roomId, eventType, stateKey, content });
    const eventId = this.eventId();
    this.echo(
      {
        type: eventType,
        sender: this.userId,
        event_id: eventId,
        room_id: roomId,
        state_key: stateKey,
        origin_server_ts: Date.now(),
        content,
      },
      new FfiEventOrigin.Cleartext(),
    );
    return Promise.resolve({ eventId, delayId: undefined });
  }

  public async sendDelayedEvent(
    roomId: string,
    eventType: string,
    contentJson: string,
    delayMs: bigint,
    stickyDurationMs: bigint | undefined,
  ): Promise<string> {
    const delayId = `delay-${this.nextDelayId++}`;
    this.record({
      kind: "delayedEvent",
      roomId,
      eventType,
      content: parse(contentJson),
      delayMs,
      stickyDurationMs,
      delayId,
    });
    if (this.refuseDelayedEvents)
      // 404 M_UNRECOGNIZED: "this homeserver will never do delayed events".
      throw new RtcError.Unsupported(
        "M_UNRECOGNIZED: delayed events are not supported",
      );
    return Promise.resolve(delayId);
  }

  public async sendDelayedStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    contentJson: string,
    delayMs: bigint,
  ): Promise<string> {
    const delayId = `delay-${this.nextDelayId++}`;
    this.record({
      kind: "delayedStateEvent",
      roomId,
      eventType,
      stateKey,
      content: parse(contentJson),
      delayMs,
      delayId,
    });
    return Promise.resolve(delayId);
  }

  public async restartDelayedEvent(
    roomId: string,
    delayId: string,
  ): Promise<void> {
    this.record({ kind: "restartDelayed", roomId, delayId });
    return Promise.resolve();
  }

  public async cancelDelayedEvent(
    roomId: string,
    delayId: string,
  ): Promise<void> {
    this.record({ kind: "cancelDelayed", roomId, delayId });
    return Promise.resolve();
  }

  public async delegateDelayedLeaveViaHomeserver(
    request: FfiHomeserverDelegationRequest,
  ): Promise<void> {
    this.record({ kind: "delegateViaHomeserver", request });
    if (this.refuseHomeserverDelegation)
      throw new RtcError.Unsupported("M_UNRECOGNIZED: no delegation endpoint");
    return Promise.resolve();
  }

  public async delegateDelayedLeaveViaTransport(
    request: FfiTransportDelegationRequest,
  ): Promise<void> {
    this.record({ kind: "delegateViaTransport", request });
    if (this.refuseTransportDelegation)
      throw new RtcError.Http("503: the service refused");
    return Promise.resolve();
  }

  public async sendToDevice(
    recipients: FfiToDeviceRecipient[],
    eventType: string,
    contentJson: string,
  ): Promise<FfiToDeviceDelivery[]> {
    this.record({
      kind: "toDevice",
      recipients,
      eventType,
      content: parse(contentJson),
    });
    // Simulated peers answer with their own key.
    for (const recipient of recipients) {
      const peer = this.peers.find(
        (p) =>
          p.userId === recipient.userId && p.deviceId === recipient.deviceId,
      );
      if (peer) queueMicrotask(() => this.peerSendsKey(peer, 0));
    }
    // every recipient reachable
    return Promise.resolve(
      recipients.map((recipient) => ({ recipient, error: undefined })),
    );
  }

  public async getRtcTransports(): Promise<FfiRtcTransport[]> {
    this.record({ kind: "getRtcTransports" });
    if (this.failTransportDiscovery)
      throw new RtcError.Http("500: transports endpoint unavailable");
    return Promise.resolve(this.transports);
  }

  public async getLivekitToken(
    request: FfiLivekitTokenRequest,
  ): Promise<FfiLivekitToken> {
    this.record({
      kind: "getLivekitToken",
      url: request.url,
      roomId: request.roomId,
      slotId: request.slotId,
      member: parse(request.memberJson),
      legacySfuGet: request.legacySfuGet,
    });
    return Promise.resolve({
      jwt: "jwt-for-" + request.url,
      url: request.url.replace("https", "wss"),
    });
  }

  public async readEvents(): Promise<string[]> {
    return Promise.resolve([]);
  }

  public async readState(
    eventType: string,
    stateKey: string | undefined,
  ): Promise<string[]> {
    return Promise.resolve(
      this.roomState
        .filter(
          (e) =>
            e.type === eventType &&
            (stateKey === undefined || e.state_key === stateKey),
        )
        .map((e) => JSON.stringify(e)),
    );
  }

  // --- inbound sinks -----------------------------------------------------------
  // The crate subscribes exactly once, when its FfiMatrixDriver is built, and
  // hands over sinks; a real driver hooks client listeners onto them. The
  // mock stores them so tests can emit fabricated events.

  public subscribeRoomEvents(sink: RoomEventSinkLike): void {
    this.roomEventSink = sink;
  }

  public subscribeToDeviceEvents(sink: ToDeviceSinkLike): void {
    this.toDeviceSink = sink;
  }

  public subscribeStateUpdates(sink: StateUpdateSinkLike): void {
    this.stateUpdateSink = sink;
  }

  public subscribeConnectivity(sink: ConnectivitySinkLike): void {
    this.connectivitySink = sink;
  }

  public isHomeserverConnected(): boolean {
    return this.homeserverConnected;
  }

  /** The homeserver comes or goes, as a syncing client would report it. */
  public setHomeserverConnected(connected: boolean): void {
    this.homeserverConnected = connected;
    this.connectivitySink?.emit(connected);
  }

  /** Emit any room event — sticky or state; the crate dispatches on type. */
  public emitRoomEvent(event: RawEvent, origin: FfiEventOrigin): boolean {
    if (!this.roomEventSink)
      throw new Error("The SDK has not subscribed to room events");
    return this.roomEventSink.emit(JSON.stringify(event), origin);
  }

  /** `senderCrossSigned` is the MSC4153 verdict; peers are cross-signed by default. */
  public emitToDevice(
    eventType: string,
    sender: string,
    content: RawEvent,
    origin: FfiEventOrigin,
    senderCrossSigned: boolean | undefined = true,
  ): boolean {
    if (!this.toDeviceSink)
      throw new Error("The SDK has not subscribed to to-device events");
    return this.toDeviceSink.emit(
      eventType,
      sender,
      JSON.stringify(content),
      origin,
      senderCrossSigned,
    );
  }

  public emitStateUpdate(events: RawEvent[]): boolean {
    if (!this.stateUpdateSink)
      throw new Error("The SDK has not subscribed to state updates");
    return this.stateUpdateSink.emit(events.map((e) => JSON.stringify(e)));
  }

  // --- simulated peers --------------------------------------------------------

  public addPeer(peer: RemotePeer): RemotePeer {
    this.peers.push(peer);
    return peer;
  }

  /** The peer publishes a join (on `MOCK_LK_SERVICE_URL` unless given). */
  public peerJoins(
    peer: RemotePeer,
    opts: { lkServiceUrl?: string; durationMs?: number } = {},
  ): boolean {
    return this.emitRoomEvent(
      memberJoinEvent({
        roomId: this.roomId,
        userId: peer.userId,
        memberId: peer.memberId,
        ...opts,
      }),
      new FfiEventOrigin.Encrypted({ senderDeviceId: peer.deviceId }),
    );
  }

  public peerLeaves(peer: RemotePeer): boolean {
    return this.emitRoomEvent(
      memberLeaveEvent({
        roomId: this.roomId,
        userId: peer.userId,
        memberId: peer.memberId,
      }),
      new FfiEventOrigin.Encrypted({ senderDeviceId: peer.deviceId }),
    );
  }

  public peerSendsKey(peer: RemotePeer, index: number): boolean {
    return this.emitToDevice(
      "m.rtc.encryption_key",
      peer.userId,
      encryptionKeyContent({
        roomId: this.roomId,
        memberId: peer.memberId,
        index,
        key: peer.key,
      }),
      new FfiEventOrigin.Encrypted({ senderDeviceId: peer.deviceId }),
    );
  }

  // --- internals -----------------------------------------------------------------

  private record(call: OutboundCall): void {
    this.outbound.push(call);
  }

  private eventId(): string {
    return `$echo-${this.nextEventId++}`;
  }

  private echo(event: RawEvent, origin: FfiEventOrigin): void {
    this.roomEventSink?.emit(JSON.stringify(event), origin);
  }
}

function parse(json: string): Record<string, unknown> {
  return JSON.parse(json) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Inbound event fabrication — the MSC4143/MSC4354 wire shapes the crate's
// dispatch reads (see its src/session/dispatch.rs). Adjust here, not in
// every test.
// ---------------------------------------------------------------------------

let eventCounter = 0;

export function memberJoinEvent(opts: {
  roomId?: string;
  userId: string;
  memberId: string;
  lkServiceUrl?: string;
  durationMs?: number;
}): RawEvent {
  return {
    type: "m.rtc.member",
    sender: opts.userId,
    event_id: `$ev-${eventCounter++}`,
    room_id: opts.roomId ?? MOCK_ROOM_ID,
    origin_server_ts: Date.now(),
    msc4354_sticky: { duration_ms: opts.durationMs ?? 240_000 },
    content: {
      slot_id: MOCK_SLOT_ID,
      // MSC4354: the sticky key lives in the content and equals member.id.
      msc4354_sticky_key: opts.memberId,
      member: { id: opts.memberId, membership: "join" },
      application: { type: "m.call" },
      transports: {
        published: [
          {
            type: "livekit",
            livekit_service_url: opts.lkServiceUrl ?? MOCK_LK_SERVICE_URL,
          },
        ],
        can_subscribe: ["livekit"],
      },
    },
  };
}

export function memberLeaveEvent(opts: {
  roomId?: string;
  userId: string;
  memberId: string;
}): RawEvent {
  return {
    type: "m.rtc.member",
    sender: opts.userId,
    event_id: `$ev-${eventCounter++}`,
    room_id: opts.roomId ?? MOCK_ROOM_ID,
    origin_server_ts: Date.now(),
    msc4354_sticky: { duration_ms: 240_000 },
    content: {
      slot_id: MOCK_SLOT_ID,
      msc4354_sticky_key: opts.memberId,
      member: { id: opts.memberId, membership: "leave" },
      leave_reason: { code: "leave" },
    },
  };
}

export function slotEvent(
  opts: { roomId?: string; status: "open" | "closed"; encrypted?: boolean } = {
    status: "open",
  },
): RawEvent {
  const content: Record<string, unknown> = {
    status: opts.status,
    application: { type: "m.call" },
  };
  if (opts.encrypted) content.encryption = { type: "m.per_member" };
  return {
    type: "m.rtc.slot",
    sender: "@admin:example.org",
    event_id: `$ev-${eventCounter++}`,
    room_id: opts.roomId ?? MOCK_ROOM_ID,
    state_key: MOCK_SLOT_ID,
    origin_server_ts: Date.now(),
    content,
  };
}

export function roomEncryptionEvent(roomId = MOCK_ROOM_ID): RawEvent {
  return {
    type: "m.room.encryption",
    sender: "@admin:example.org",
    event_id: `$ev-${eventCounter++}`,
    room_id: roomId,
    state_key: "",
    origin_server_ts: Date.now(),
    content: { algorithm: "m.megolm.v1.aes-sha2" },
  };
}

/** `m.room.member` state with the profile fields the crate puts on a member. */
export function roomMemberEvent(opts: {
  roomId?: string;
  userId: string;
  membership?: "join" | "invite" | "leave";
  displayName?: string;
  avatarUrl?: string;
}): RawEvent {
  const content: Record<string, unknown> = {
    membership: opts.membership ?? "join",
  };
  if (opts.displayName !== undefined) content.displayname = opts.displayName;
  if (opts.avatarUrl !== undefined) content.avatar_url = opts.avatarUrl;
  return {
    type: "m.room.member",
    sender: opts.userId,
    event_id: `$ev-${eventCounter++}`,
    room_id: opts.roomId ?? MOCK_ROOM_ID,
    state_key: opts.userId,
    origin_server_ts: Date.now(),
    content,
  };
}

const DEFAULT_KEY = new Uint8Array(32).fill(7);

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=+$/, "");
}

/** MSC4143 `m.rtc.encryption_key` content. */
export function encryptionKeyContent(opts: {
  roomId?: string;
  memberId: string;
  index: number;
  key?: Uint8Array;
}): RawEvent {
  return {
    room_id: opts.roomId ?? MOCK_ROOM_ID,
    member_id: opts.memberId,
    media_key: { index: opts.index, key: base64(opts.key ?? DEFAULT_KEY) },
    format: 0,
  };
}

/** One timer tick: the crate's listener callbacks arrive after the emitting task yields. */
export const tick = async (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function waitFor(
  what: string,
  cond: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
