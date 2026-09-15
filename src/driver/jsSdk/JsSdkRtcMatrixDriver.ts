/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * An {@link RtcMatrixDriver} over a matrix-js-sdk client: the crate's
 * MatrixRTC seam, nothing else. The standalone app, the widget and the SDK
 * build hand this to Element Call, and a host that already runs matrix-js-sdk
 * can use it as it is.
 *
 * It serves two kinds of client. A full `MatrixClient` syncs, decrypts and
 * has an access token of its own. A `RoomWidgetClient` is a shell over the
 * widget API: it never sees ciphertext (its host decrypts), has no crypto
 * backend and no token, only emits the legacy to-device event, and answers
 * transport discovery over the widget API. Every place the two differ is
 * marked "widget".
 *
 * Adapted from the crate's `web-test-app/src/jsSdkDriver.ts`.
 */

import {
  ClientEvent,
  type IOpenIDToken,
  type MatrixClient,
  type MatrixEvent,
  MatrixError,
  type ReceivedToDeviceMessage,
  type Room,
  RoomEvent,
  RoomStateEvent,
  RoomStickyEventsEvent,
  RoomWidgetClient,
  SyncState,
  UnsupportedDelayedEventsEndpointError,
  UnsupportedStickyEventsEndpointError,
  UpdateDelayedEventAction,
  parseErrorResponse,
} from "matrix-js-sdk";
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { logger as rootLogger, type Logger } from "matrix-js-sdk/lib/logger";

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
  type RoomEventSinkLike,
  type StateUpdateSinkLike,
  type ToDeviceSinkLike,
} from "../../matrix-rtc-sdk";
import { doNetworkOperationWithRetry } from "../../utils/matrix";
import { type RtcMatrixDriver } from "../RtcMatrixDriver";

export interface JsSdkRtcMatrixDriverOptions {
  logger?: Logger;
}

export class JsSdkRtcMatrixDriver implements RtcMatrixDriver {
  private readonly roomId: string;
  private readonly logger: Logger;
  /** Widget: the host decrypts for us and there is no crypto backend. */
  private readonly widget: boolean;
  private readonly detachers: (() => void)[] = [];
  /** curve25519 sender key → device id, per megolm-attributed sender. */
  private readonly senderDeviceCache = new Map<string, string>();

  public constructor(
    private readonly client: MatrixClient,
    private readonly room: Room,
    options: JsSdkRtcMatrixDriverOptions = {},
  ) {
    this.roomId = room.roomId;
    this.widget = client instanceof RoomWidgetClient;
    this.logger = (options.logger ?? rootLogger).getChild(
      `[JsSdkRtcMatrixDriver ${room.roomId}]`,
    );
  }

  /** Unhooks every client listener. The crate's sinks stop being fed. */
  public detach(): void {
    for (const detach of this.detachers.splice(0)) detach();
  }

  // --- outbound --------------------------------------------------------------

  public async sendStickyEvent(
    roomId: string,
    eventType: string,
    contentJson: string,
    durationMs: bigint,
  ): Promise<FfiSendEventResponse> {
    return guard(async () => {
      const res = await this.client._unstable_sendStickyEvent(
        roomId,
        Number(durationMs),
        null,
        eventType as never,
        JSON.parse(contentJson) as never,
      );
      return { eventId: res.event_id, delayId: undefined };
    });
  }

  public async sendStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    contentJson: string,
  ): Promise<FfiSendEventResponse> {
    return guard(async () => {
      const res = await this.client.sendStateEvent(
        roomId,
        eventType as never,
        JSON.parse(contentJson) as never,
        stateKey,
      );
      return { eventId: res.event_id, delayId: undefined };
    });
  }

  public async sendDelayedEvent(
    roomId: string,
    eventType: string,
    contentJson: string,
    delayMs: bigint,
    stickyDurationMs: bigint | undefined,
  ): Promise<string> {
    return guard(async () => {
      const content = JSON.parse(contentJson) as never;
      const res =
        stickyDurationMs === undefined
          ? await this.client._unstable_sendDelayedEvent(
              roomId,
              { delay: Number(delayMs) },
              null,
              eventType as never,
              content,
            )
          : await this.client._unstable_sendStickyDelayedEvent(
              roomId,
              Number(stickyDurationMs),
              { delay: Number(delayMs) },
              null,
              eventType as never,
              content,
            );
      return res.delay_id;
    });
  }

  public async sendDelayedStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    contentJson: string,
    delayMs: bigint,
  ): Promise<string> {
    return guard(async () => {
      const res = await this.client._unstable_sendDelayedStateEvent(
        roomId,
        { delay: Number(delayMs) },
        eventType as never,
        JSON.parse(contentJson) as never,
        stateKey,
      );
      return res.delay_id;
    });
  }

  public async restartDelayedEvent(
    _roomId: string,
    delayId: string,
  ): Promise<void> {
    await guard(async () =>
      this.client._unstable_updateDelayedEvent(
        delayId,
        UpdateDelayedEventAction.Restart,
      ),
    );
  }

  public async cancelDelayedEvent(
    _roomId: string,
    delayId: string,
  ): Promise<void> {
    await guard(async () =>
      this.client._unstable_updateDelayedEvent(
        delayId,
        UpdateDelayedEventAction.Cancel,
      ),
    );
  }

  /**
   * MSC4195, the way Element Call has always done it: the MatrixRTC
   * authorisation service takes over the delayed leave when asked for a token
   * with `delay_id`, `delay_timeout` and the homeserver it should restart it
   * at. The token in the answer is discarded. (Interim: plan item C5 moves
   * the choice of route into the crate and leaves only primitives here.)
   */
  public async delegateLivekitDelayedLeave(
    roomId: string,
    slotId: string,
    memberJson: string,
    delayId: string,
    livekitServiceUrl: string | undefined,
    delayMs: bigint,
  ): Promise<void> {
    if (livekitServiceUrl === undefined)
      throw new RtcError.Unsupported(
        "A receive-only member has no transport to delegate to",
      );
    await guard(async () => {
      const member = JSON.parse(memberJson) as MemberClaims;
      const delegation = {
        delay_id: delayId,
        delay_timeout: Number(delayMs),
        delay_cs_api_url: this.client.baseUrl,
      };
      await this.requestToken(
        livekitServiceUrl,
        roomId,
        slotId,
        member,
        false,
        delegation,
      );
    });
  }

  public async sendToDevice(
    recipients: FfiToDeviceRecipient[],
    eventType: string,
    contentJson: string,
  ): Promise<FfiToDeviceDelivery[]> {
    return guard(async () => {
      // Olm-encrypted, per specific device — never `*`. On a widget client
      // this asks the host to encrypt; the plain `sendToDevice` there would
      // go out in clear.
      await this.client.encryptAndSendToDevice(
        eventType,
        recipients,
        JSON.parse(contentJson) as Record<string, unknown>,
      );
      return recipients.map((recipient) => ({ recipient, error: undefined }));
    });
  }

  public async getRtcTransports(): Promise<FfiRtcTransport[]> {
    return guard(async () => {
      // The homeserver endpoint (MSC4143), or the widget host's answer to
      // the same question (MSC4515) — the client knows which.
      const transports = await doNetworkOperationWithRetry(async () =>
        this.client._unstable_getRTCTransports(),
      );
      return transports.map(({ type, ...properties }: Transport) => ({
        transportType: String(type),
        propertiesJson: JSON.stringify(properties),
      }));
    });
  }

  public async getLivekitToken(
    request: FfiLivekitTokenRequest,
  ): Promise<FfiLivekitToken> {
    return guard(async () => {
      const token = await this.requestToken(
        request.url,
        request.roomId,
        request.slotId,
        JSON.parse(request.memberJson) as MemberClaims,
        request.legacySfuGet,
      );
      return { jwt: token.jwt, url: token.url };
    });
  }

  private async requestToken(
    serviceUrl: string,
    roomId: string,
    slotId: string,
    member: MemberClaims,
    legacySfuGet: boolean,
    delegation: Record<string, unknown> = {},
  ): Promise<{ jwt: string; url?: string }> {
    let openIdToken: IOpenIDToken;
    try {
      openIdToken = await doNetworkOperationWithRetry(async () =>
        this.client.getOpenIdToken(),
      );
    } catch (e) {
      throw new RtcError.Http(`Could not get an OpenID token: ${String(e)}`);
    }
    const base = serviceUrl.replace(/\/$/, "");
    const [endpoint, body] = legacySfuGet
      ? [
          `${base}/sfu/get`,
          {
            // The legacy endpoint derives the LiveKit room alias from the
            // Matrix room id alone.
            room: roomId,
            openid_token: openIdToken,
            device_id: member.claimed_device_id,
            ...delegation,
          },
        ]
      : [
          `${base}/get_token`,
          {
            room_id: roomId,
            slot_id: slotId,
            openid_token: openIdToken,
            member,
            ...delegation,
          },
        ];
    const response = await doNetworkOperationWithRetry(async () =>
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 404)
        throw new RtcError.Unsupported(`${endpoint}: ${response.status}`);
      throw parseErrorResponse(response, text);
    }
    return (await response.json()) as { jwt: string; url?: string };
  }

  // --- reads (the crate's session seed) ---------------------------------------

  public async readEvents(
    eventType: string,
    _stateKey: string | undefined,
    limit: number,
  ): Promise<string[]> {
    const out: string[] = [];
    for (const event of this.room._unstable_getStickyEvents()) {
      await this.client.decryptEventIfNeeded(event);
      if (event.getType() !== eventType) continue;
      out.push(JSON.stringify(rawEvent(event)));
      if (out.length >= limit) break;
    }
    return out;
  }

  public async readState(
    eventType: string,
    stateKey: string | undefined,
  ): Promise<string[]> {
    const events =
      stateKey === undefined
        ? this.room.currentState.getStateEvents(eventType)
        : [this.room.currentState.getStateEvents(eventType, stateKey)].filter(
            (e): e is MatrixEvent => Boolean(e),
          );
    return Promise.resolve(
      events.map((event) => JSON.stringify(rawEvent(event))),
    );
  }

  // --- inbound sinks ----------------------------------------------------------

  public subscribeRoomEvents(sink: RoomEventSinkLike): void {
    const emit = async (event: MatrixEvent): Promise<void> => {
      await this.client.decryptEventIfNeeded(event);
      if (event.isDecryptionFailure()) {
        this.logger.warn(`Event ${event.getId()} failed to decrypt; skipped`);
        return;
      }
      if (
        !sink.emit(
          JSON.stringify(rawEvent(event)),
          await this.roomEventOrigin(event),
        )
      )
        detach();
    };
    // Sticky events come from the room's sticky store: sync delivers them in
    // the room's `msc4354_sticky` section, our own included.
    const onSticky = (
      added: MatrixEvent[],
      updated: { current: MatrixEvent }[],
    ): void => {
      for (const event of [...added, ...updated.map((u) => u.current)])
        void emit(event);
    };
    // Everything else (state events in the timeline) comes from the timeline;
    // local echoes and sticky events are skipped there.
    const onTimeline = (
      event: MatrixEvent,
      room: Room | undefined,
      toStartOfTimeline: boolean | undefined,
    ): void => {
      if (room?.roomId !== this.roomId || toStartOfTimeline) return;
      if (event.status !== null || event.unstableStickyInfo !== undefined)
        return;
      void emit(event);
    };
    const detach = (): void => {
      this.room.off(RoomStickyEventsEvent.Update, onSticky);
      this.client.off(RoomEvent.Timeline, onTimeline);
    };
    this.room.on(RoomStickyEventsEvent.Update, onSticky);
    this.client.on(RoomEvent.Timeline, onTimeline);
    this.detachers.push(detach);
  }

  public subscribeStateUpdates(sink: StateUpdateSinkLike): void {
    // Client-level listener: the room-level re-emit is unreliable under
    // MSC4222 `state_after` churn.
    const onState = (event: MatrixEvent): void => {
      if (event.getRoomId() !== this.roomId) return;
      if (!sink.emit([JSON.stringify(rawEvent(event))])) detach();
    };
    const detach = (): void => {
      this.client.off(RoomStateEvent.Events, onState);
    };
    this.client.on(RoomStateEvent.Events, onState);
    this.detachers.push(detach);
  }

  public subscribeToDeviceEvents(sink: ToDeviceSinkLike): void {
    if (this.widget) {
      // Widget: the legacy event is the only one the widget client emits.
      // The host decrypted the message; it says whether it was encrypted but
      // not by which device, so the device is the one the content claims.
      const onToDevice = (event: MatrixEvent): void => {
        const content = event.getContent() as KeyMessageContent;
        const origin = event.isEncrypted()
          ? new FfiEventOrigin.Encrypted({
              senderDeviceId: claimedKeyDevice(content),
            })
          : new FfiEventOrigin.Cleartext();
        if (
          !sink.emit(
            event.getType(),
            event.getSender() ?? "",
            JSON.stringify(content),
            origin,
            undefined,
          )
        )
          detach();
      };
      const detach = (): void => {
        this.client.off(ClientEvent.ToDeviceEvent, onToDevice);
      };
      this.client.on(ClientEvent.ToDeviceEvent, onToDevice);
      this.detachers.push(detach);
      return;
    }
    const onToDevice = (received: ReceivedToDeviceMessage): void =>
      void handleToDevice(received);
    const handleToDevice = async ({
      message,
      encryptionInfo,
    }: ReceivedToDeviceMessage): Promise<void> => {
      const origin = encryptionInfo
        ? new FfiEventOrigin.Encrypted({
            senderDeviceId: encryptionInfo.senderDevice,
          })
        : new FfiEventOrigin.Cleartext();
      // MSC4153: is the sending device cross-signed by its owner?
      let crossSigned: boolean | undefined;
      const crypto = this.client.getCrypto();
      if (crypto && encryptionInfo?.senderDevice) {
        const status = await crypto.getDeviceVerificationStatus(
          encryptionInfo.sender,
          encryptionInfo.senderDevice,
        );
        crossSigned = status?.signedByOwner ?? false;
      }
      if (
        !sink.emit(
          message.type,
          message.sender,
          JSON.stringify(message.content ?? {}),
          origin,
          crossSigned,
        )
      )
        detach();
    };
    const detach = (): void => {
      this.client.off(ClientEvent.ReceivedToDeviceMessage, onToDevice);
    };
    this.client.on(ClientEvent.ReceivedToDeviceMessage, onToDevice);
    this.detachers.push(detach);
  }

  // --- connectivity ------------------------------------------------------------

  public isHomeserverConnected(): boolean {
    // Widget: the widget client reports Syncing once it has seen an event
    // and never anything else, so on a widget this is always true.
    return this.client.getSyncState() === SyncState.Syncing;
  }

  public subscribeConnectivity(sink: ConnectivitySinkLike): void {
    const onSync = (): void => {
      if (!sink.emit(this.isHomeserverConnected())) detach();
    };
    const detach = (): void => {
      this.client.off(ClientEvent.Sync, onSync);
    };
    this.client.on(ClientEvent.Sync, onSync);
    this.detachers.push(detach);
  }

  private async roomEventOrigin(event: MatrixEvent): Promise<FfiEventOrigin> {
    if (this.widget) {
      // Widget: events arrive decrypted with no metadata. In an encrypted
      // room they were encrypted, by the device the content claims — the
      // same trust matrix-js-sdk's own session extends.
      if (event.isState() || !this.room.hasEncryptionStateEvent())
        return new FfiEventOrigin.Cleartext();
      return new FfiEventOrigin.Encrypted({
        senderDeviceId: claimedMemberDevice(event.getContent()),
      });
    }
    if (!event.isEncrypted()) return new FfiEventOrigin.Cleartext();
    return new FfiEventOrigin.Encrypted({
      senderDeviceId: await this.senderDeviceOf(event),
    });
  }

  /** The device that megolm-encrypted `event` (sender key → device list). */
  private async senderDeviceOf(
    event: MatrixEvent,
  ): Promise<string | undefined> {
    const senderKey = event.getSenderKey();
    const sender = event.getSender();
    const crypto = this.client.getCrypto();
    if (!senderKey || !sender || !crypto) return undefined;
    const cached = this.senderDeviceCache.get(senderKey);
    if (cached) return cached;
    const devices = await crypto.getUserDeviceInfo([sender], true);
    for (const device of devices.get(sender)?.values() ?? []) {
      if (device.getIdentityKey() === senderKey) {
        this.senderDeviceCache.set(senderKey, device.deviceId);
        return device.deviceId;
      }
    }
    return undefined;
  }
}

/** The full (decrypted) event object the crate's dispatch reads. */
function rawEvent(event: MatrixEvent): Record<string, unknown> {
  return {
    ...(event.event as Record<string, unknown>),
    type: event.getType(),
    content: event.getContent(),
    sender: event.getSender(),
    event_id: event.getId(),
    room_id: event.getRoomId(),
    origin_server_ts: event.getTs(),
    state_key: event.getStateKey(),
  };
}

/** MSC4195 member claims, as the crate serialises them. */
interface MemberClaims {
  id: string;
  claimed_user_id: string;
  claimed_device_id: string;
}

/** The device a media key message claims to come from, in either dialect. */
interface KeyMessageContent {
  member?: { claimed_device_id?: string };
  device_id?: string;
}

function claimedKeyDevice(content: KeyMessageContent): string | undefined {
  return content.member?.claimed_device_id ?? content.device_id;
}

/** The device a 2025-dialect membership claims (`member.device_id`). */
function claimedMemberDevice(
  content: Record<string, unknown>,
): string | undefined {
  const member = content.member as { device_id?: unknown } | undefined;
  return typeof member?.device_id === "string" ? member.device_id : undefined;
}

/** Map js-sdk / HTTP failures onto the error the crate reasons about. */
function toRtcError(error: unknown): Error {
  if (RtcError.instanceOf(error)) return error;
  if (
    error instanceof UnsupportedDelayedEventsEndpointError ||
    error instanceof UnsupportedStickyEventsEndpointError
  )
    return new RtcError.Unsupported(String(error));
  if (error instanceof MatrixError) {
    if (error.errcode === "M_LIMIT_EXCEEDED")
      return new RtcError.RateLimited({
        retryAfterMs:
          typeof error.data.retry_after_ms === "number"
            ? BigInt(error.data.retry_after_ms)
            : undefined,
      });
    if (error.httpStatus === 404 || error.errcode === "M_UNRECOGNIZED")
      return new RtcError.Unsupported(String(error));
    if (error.httpStatus === 403 || error.errcode === "M_FORBIDDEN")
      return new RtcError.Rejected(String(error));
    return new RtcError.Http(String(error));
  }
  return new RtcError.Driver(String(error));
}

async function guard<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (error) {
    throw toRtcError(error);
  }
}
