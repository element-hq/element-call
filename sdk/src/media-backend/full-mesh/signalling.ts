/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The to-device signalling of the full mesh transport (MSCXXXX): four event
 * types, the fields every one carries, and the ordering by `seq`. It sets a
 * connection up; the control channel carries the rest.
 */

import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  ClientEvent,
  EventType,
  type MatrixClient,
  type MatrixEvent,
} from "matrix-js-sdk";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { fromEvent, Observable, share } from "rxjs";

import { type ObservableScope } from "../../reactive/ObservableScope";
import { type ControlMessage } from "./ControlChannel";
import { parseConsumptionMetadata, parseStreamMetadata } from "./metadata";

export const FULL_MESH_TRANSPORT_TYPE = "org.matrix.mscXXXX.full_mesh";

const prefix = "org.matrix.mscXXXX.rtc.full_mesh";
/** The event type of each payload type. */
export const SignallingEventType = {
  subscribe: `${prefix}.subscribe`,
  description: `${prefix}.description`,
  candidates: `${prefix}.candidates`,
  close: `${prefix}.close`,
} as const;

export const signallingEventTypes: string[] =
  Object.values(SignallingEventType);

/** How long a gap in `seq` is waited for before the missing messages are skipped. */
export const SEQ_GAP_TIMEOUT_MS = 10_000;

interface CommonContent {
  room_id: string;
  slot_id: string;
  member_id: string;
  target_member_id: string;
  connection_id: string;
  seq: number;
  /**
   * Not in the MSC, which takes the device from the Olm session. The js-sdk
   * does not expose that for to-device events, so, like the key transport's
   * `claimed_device_id`, the sender states it.
   */
  device_id: string;
}

/** What a connection hears from its peer, over to-device messages or the control channel. */
export type ConnectionMessage =
  | ControlMessage
  | { type: "close"; reason?: string };

export type SignallingPayload =
  | { type: "subscribe" }
  | Extract<
      ConnectionMessage,
      { type: "description" | "candidates" | "close" }
    >;

export type SignallingMessage = SignallingPayload & {
  /** The member that sent it, as named in `member_id`. */
  memberId: string;
  userId: string;
  deviceId: string;
  connectionId: string;
};

/** Another member, as far as signalling needs to know it. */
export interface Peer {
  userId: string;
  deviceId: string;
  memberId: string;
}

export interface Signalling {
  send(peer: Peer, connectionId: string, payload: SignallingPayload): void;
  /** Every valid message for us, per sender in `seq` order. */
  messages$: Observable<SignallingMessage>;
}

export type SignallingClient = Pick<
  MatrixClient,
  "encryptAndSendToDevice" | "on" | "off"
>;

interface Props {
  scope: ObservableScope;
  client: SignallingClient;
  roomId: string;
  slotId: string;
  own: CallMembershipIdentityParts;
  logger: Logger;
}

export function createSignalling({
  scope,
  client,
  roomId,
  slotId,
  own,
  logger: parentLogger,
}: Props): Signalling {
  const logger = parentLogger.getChild("[Signalling]");
  const nextSeqTo = new Map<string, number>();

  const send = (
    peer: Peer,
    connectionId: string,
    { type, ...payload }: SignallingPayload,
  ): void => {
    const eventType = SignallingEventType[type];
    const seq = nextSeqTo.get(peer.memberId) ?? 0;
    nextSeqTo.set(peer.memberId, seq + 1);
    const content: CommonContent & Record<string, unknown> = {
      ...payload,
      room_id: roomId,
      slot_id: slotId,
      member_id: own.memberId,
      target_member_id: peer.memberId,
      connection_id: connectionId,
      seq,
      device_id: own.deviceId,
    };
    client
      .encryptAndSendToDevice(
        eventType,
        [{ userId: peer.userId, deviceId: peer.deviceId }],
        content,
      )
      .catch((e: unknown) => logger.warn(`Failed to send ${eventType}`, e));
  };

  const messages$ = new Observable<SignallingMessage>((subscriber) => {
    const orderers = new Map<string, SeqOrderer<SignallingMessage>>();
    const sub = fromEvent<MatrixEvent>(client, ClientEvent.ToDeviceEvent)
      .pipe(scope.bind())
      .subscribe((event) => {
        const parsed = parse(event, roomId, slotId, own.memberId, logger);
        if (parsed === null) return;
        let orderer = orderers.get(parsed.message.memberId);
        if (orderer === undefined) {
          orderer = new SeqOrderer((m) => subscriber.next(m), logger);
          orderers.set(parsed.message.memberId, orderer);
        }
        orderer.push(parsed.seq, parsed.message);
      });
    return () => {
      sub.unsubscribe();
      for (const orderer of orderers.values()) orderer.dispose();
    };
  }).pipe(share());

  return { send, messages$ };
}

function parse(
  event: MatrixEvent,
  roomId: string,
  slotId: string,
  ownMemberId: string,
  logger: Logger,
): { seq: number; message: SignallingMessage } | null {
  const type = event.getType();
  if (!signallingEventTypes.includes(type)) return null;
  // Via the widget API, to-device events are reconstructed as encrypted
  if (event.getWireType() !== EventType.RoomMessageEncrypted) {
    logger.warn(`Dropping ${type} sent in clear from ${event.getSender()}`);
    return null;
  }
  const c = event.getContent<
    Partial<CommonContent> & Record<string, unknown>
  >();
  const userId = event.getSender();
  if (
    userId === undefined ||
    c.room_id !== roomId ||
    c.slot_id !== slotId ||
    c.target_member_id !== ownMemberId ||
    typeof c.member_id !== "string" ||
    typeof c.connection_id !== "string" ||
    typeof c.device_id !== "string" ||
    typeof c.seq !== "number"
  )
    return null;
  const common = {
    memberId: c.member_id,
    userId,
    deviceId: c.device_id,
    connectionId: c.connection_id,
  };
  let payload: SignallingPayload;
  switch (type) {
    case SignallingEventType.subscribe:
      payload = { type: "subscribe" };
      break;
    case SignallingEventType.description: {
      const d = c.description as { type?: unknown; sdp?: unknown } | undefined;
      if (
        (d?.type !== "offer" && d?.type !== "answer") ||
        typeof d.sdp !== "string"
      )
        return null;
      payload = {
        type: "description",
        description: { type: d.type, sdp: d.sdp },
        stream_metadata: parseStreamMetadata(c.stream_metadata) ?? undefined,
        consumption_metadata:
          parseConsumptionMetadata(c.consumption_metadata) ?? undefined,
      };
      break;
    }
    case SignallingEventType.candidates:
      if (!Array.isArray(c.candidates)) return null;
      payload = {
        type: "candidates",
        candidates: c.candidates as RTCIceCandidateInit[],
      };
      break;
    case SignallingEventType.close:
      payload = {
        type: "close",
        reason: typeof c.reason === "string" ? c.reason : undefined,
      };
      break;
    default:
      return null;
  }
  return { seq: c.seq, message: { ...payload, ...common } };
}

/**
 * Delivers the messages of one sender in `seq` order. A gap is waited for
 * `SEQ_GAP_TIMEOUT_MS`, then skipped. A message below the next expected `seq`
 * came after its gap was skipped, and is dropped.
 */
export class SeqOrderer<T> {
  private next = 0;
  private readonly buffer = new Map<number, T>();
  private gapTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly deliver: (item: T) => void,
    private readonly logger?: Logger,
    private readonly gapTimeoutMs = SEQ_GAP_TIMEOUT_MS,
  ) {}

  public push(seq: number, item: T): void {
    if (seq < this.next) {
      this.logger?.warn(`Dropping seq ${seq}, already past it`);
      return;
    }
    this.buffer.set(seq, item);
    this.flush();
  }

  public dispose(): void {
    clearTimeout(this.gapTimer);
    this.buffer.clear();
  }

  private flush(): void {
    let item = this.buffer.get(this.next);
    while (item !== undefined) {
      this.buffer.delete(this.next);
      this.next++;
      this.deliver(item);
      item = this.buffer.get(this.next);
    }
    clearTimeout(this.gapTimer);
    this.gapTimer = undefined;
    if (this.buffer.size > 0)
      this.gapTimer = setTimeout(() => this.skipGap(), this.gapTimeoutMs);
  }

  private skipGap(): void {
    const lowest = Math.min(...this.buffer.keys());
    this.logger?.warn(`Skipping seq ${this.next} to ${lowest - 1}`);
    this.next = lowest;
    this.flush();
  }
}
