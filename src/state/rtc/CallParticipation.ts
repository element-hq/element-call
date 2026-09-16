/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger as rootLogger, type Logger } from "matrix-js-sdk/lib/logger";
import {
  BehaviorSubject,
  type Observable,
  Subject,
  combineLatest,
  map,
} from "rxjs";

import { type RtcMatrixDriver } from "../../driver/RtcMatrixDriver";
import {
  FfiMatrixDriver,
  FfiMembershipState,
  FfiParticipationManager,
  FfiStatus,
  type FfiConnectionWithMembers,
  type FfiJoinParams,
  type FfiLivekitToken,
  type FfiLivekitTokenRequest,
  type FfiMediaKey,
  type FfiMembership,
  type FfiParticipationConfig,
  type FfiRtcTransport,
  type FfiSendEventResponse,
  type FfiSessionSnapshot,
  type FfiToDeviceDelivery,
  type FfiToDeviceRecipient,
  type FfiHomeserverDelegationRequest,
  type FfiTransportDelegationRequest,
  type FfiTransportIntent,
  type ConnectivitySinkLike,
  type RoomEventSinkLike,
  type StateUpdateSinkLike,
  type ToDeviceSinkLike,
} from "../../matrix-rtc-sdk";
import { type Behavior } from "../Behavior";
import { Epoch, type ObservableScope, trackEpoch } from "../ObservableScope";
import { NoOpenSlotError } from "../../utils/errors";
import {
  ELEMENT_CALL_APPLICATION,
  ELEMENT_CALL_SLOT_ID,
  LEGACY_SLOT_ID,
  slotIdForCompat,
} from "./slot";
import { LIVEKIT_TRANSPORT_TYPE } from "./transportIntent";

/**
 * What to do about the room's slot when joining. A call needs an open
 * MatrixRTC slot (`m.rtc.slot` state); a room that never had a call has
 * none, and the client that starts the call opens it — if its user has the
 * power level to send the state event.
 */
export interface SlotPolicy {
  /** Whether the slot, if we open it, prescribes per-member media encryption (an encrypted room). */
  encrypted: boolean;
  /** Whether this user may send the slot state event (`RoomInfo.canOpenSlot`). */
  canOpen: boolean;
}

/** How long to wait for the seed, and for our own slot event to echo back. */
const SLOT_WAIT_MS = 15_000;

export interface CallParticipationOptions {
  /**
   * One manager per `(room, slot)`; Element Call has one slot per room.
   * Defaults to the slot for the config's dialect ({@link slotIdForCompat}).
   */
  slotId?: string;
  config: FfiParticipationConfig;
  /**
   * A LiveKit service URL to fall back on when the homeserver advertises no
   * transport (or cannot be asked) — Element Call's `config.json` value,
   * which is Element Call's business rather than the host's.
   */
  transportFallbackUrl?: string;
  logger?: Logger;
}

/**
 * Element Call's view of one participation in a MatrixRTC session: the
 * crate's `FfiParticipationManager` as behaviors. "Participation" is the
 * crate's word for the FFI side; this is the RxJS wrapper a call is built on.
 *
 * The crate does everything Matrix: it projects the session from the
 * driver's events, publishes and keeps alive our own membership, mints
 * transport tokens and exchanges media keys. This class owns the manager
 * for the scope's lifetime, seeds each behavior from the manager's getter and
 * keeps it current from the manager's listener, and ends the participation
 * (leaving if still joined) when the scope ends.
 */
export class CallParticipation {
  private readonly logger: Logger;
  private readonly matrixDriver: FfiMatrixDriver;
  private readonly manager: FfiParticipationManager;
  private ended = false;
  private readonly slotId: string;

  private readonly membershipsSubject$: BehaviorSubject<FfiMembership[]>;
  private readonly connectionsSubject$: BehaviorSubject<
    FfiConnectionWithMembers[]
  >;
  private readonly keyMapSubject$: BehaviorSubject<FfiMediaKey[]>;
  private readonly keyChangesSubject$ = new Subject<FfiMediaKey>();
  private readonly statusSubject$: BehaviorSubject<FfiStatus>;
  private readonly sessionSubject$: BehaviorSubject<FfiSessionSnapshot>;
  private readonly ownMemberIdSubject$: BehaviorSubject<string | null>;
  private readonly ownTransportIdentitySubject$: BehaviorSubject<string | null>;

  /**
   * One entry per joined member, ourselves included once our own membership
   * has echoed back from the homeserver. Members that left but may still hold
   * our media key (`LeftWithKeys`) are not listed.
   */
  public readonly memberships$: Behavior<Epoch<FfiMembership[]>>;
  /** The LiveKit rooms to hold, with the token for each. */
  public readonly connections$: Behavior<FfiConnectionWithMembers[]>;
  /** Every media key in use, ours and theirs, one per (member, index). */
  public readonly keyMap$: Behavior<FfiMediaKey[]>;
  /** The single key that changed, as it changes. */
  public readonly keyChanges$: Observable<FfiMediaKey> =
    this.keyChangesSubject$;
  public readonly status$: Behavior<FfiStatus>;
  /** Slot open?, encrypted?, member count, seed honesty. */
  public readonly session$: Behavior<FfiSessionSnapshot>;
  /** Our member id, from the moment `join()` starts; null while not joined. */
  public readonly ownMemberId$: Behavior<string | null>;
  /** Our LiveKit participant identity, known as early as the member id. */
  public readonly ownTransportIdentity$: Behavior<string | null>;
  /** Our own entry in `memberships$`, once echoed. */
  public readonly ownMembership$: Behavior<FfiMembership | null>;

  public constructor(
    scope: ObservableScope,
    driver: RtcMatrixDriver,
    roomId: string,
    userId: string,
    deviceId: string,
    options: CallParticipationOptions,
  ) {
    this.logger = (options.logger ?? rootLogger).getChild(
      "[CallParticipation]",
    );
    const rtcDriver =
      options.transportFallbackUrl === undefined
        ? driver
        : new TransportFallbackDriver(
            driver,
            options.transportFallbackUrl,
            this.logger,
          );
    this.matrixDriver = new FfiMatrixDriver(rtcDriver);
    this.slotId = options.slotId ?? slotIdForCompat(options.config.compat);
    this.manager = new FfiParticipationManager(
      roomId,
      this.slotId,
      userId,
      deviceId,
      this.matrixDriver,
      options.config,
    );

    this.membershipsSubject$ = new BehaviorSubject(
      joinedOnly(this.manager.memberships()),
    );
    this.connectionsSubject$ = new BehaviorSubject(this.manager.connections());
    this.keyMapSubject$ = new BehaviorSubject(this.manager.keyMap());
    this.statusSubject$ = new BehaviorSubject(this.manager.status());
    this.sessionSubject$ = new BehaviorSubject(this.manager.session());
    this.ownMemberIdSubject$ = new BehaviorSubject(
      this.manager.ownMemberId() ?? null,
    );
    this.ownTransportIdentitySubject$ = new BehaviorSubject(
      this.manager.ownTransportIdentity() ?? null,
    );

    this.manager.setMembershipsListener({
      onMembershipsChange: (memberships) => {
        if (this.ended) return;
        this.membershipsSubject$.next(joinedOnly(memberships));
        this.sessionSubject$.next(this.manager.session());
        this.refreshOwnIdentity();
      },
    });
    // The room's view of the session moves without any membership or status
    // of ours changing: the seed completing, somebody opening the slot.
    this.manager.setSessionListener({
      onSessionChange: (session) => {
        if (!this.ended) this.sessionSubject$.next(session);
      },
    });
    this.manager.setConnectionsListener({
      onConnectionsChange: (connections) => {
        if (!this.ended) this.connectionsSubject$.next(connections);
      },
    });
    this.manager.setKeyMapListener({
      onKeyMapChange: (keyMap, change) => {
        if (this.ended) return;
        this.keyMapSubject$.next(keyMap);
        this.keyChangesSubject$.next(change);
      },
    });
    this.manager.setStatusListener({
      onStatusChange: (status) => {
        if (this.ended) return;
        this.statusSubject$.next(status);
        this.sessionSubject$.next(this.manager.session());
        this.refreshOwnIdentity();
      },
    });
    this.manager.setKeyRejectedListener({
      onKeyRejected: (memberId, reason) =>
        this.logger.warn(`Discarded a media key from ${memberId}: ${reason}`),
    });

    this.memberships$ = scope.behavior(
      this.membershipsSubject$.pipe(trackEpoch()),
      new Epoch(this.membershipsSubject$.value),
    );
    this.connections$ = scope.behavior(this.connectionsSubject$);
    this.keyMap$ = scope.behavior(this.keyMapSubject$);
    this.status$ = scope.behavior(this.statusSubject$);
    this.session$ = scope.behavior(this.sessionSubject$);
    this.ownMemberId$ = scope.behavior(this.ownMemberIdSubject$);
    this.ownTransportIdentity$ = scope.behavior(
      this.ownTransportIdentitySubject$,
    );
    this.ownMembership$ = scope.behavior(
      combineLatest([this.memberships$, this.ownMemberId$]).pipe(
        map(
          ([memberships, ownMemberId]) =>
            memberships.value.find((m) => m.member.memberId === ownMemberId) ??
            null,
        ),
      ),
    );

    scope.onEnd(() => void this.end());
  }

  /**
   * Join the session, opening the room's slot first when nobody has
   * (`slot`). Resolves once our membership is published, or rejects: with
   * {@link NoOpenSlotError} when there is no slot and we may not open one,
   * otherwise with the crate's typed error. The status keeps reporting from
   * there.
   */
  public async join(
    intent: FfiTransportIntent,
    params: FfiJoinParams,
    slot: SlotPolicy,
  ): Promise<void> {
    if (this.ended) throw new Error("The participation has ended");
    try {
      await this.ensureOpenSlot(slot);
      await this.manager.join(intent, params);
    } finally {
      this.refreshAll();
    }
  }

  private async ensureOpenSlot(slot: SlotPolicy): Promise<void> {
    // The pre-slot generation has no slot to open or check.
    if (this.slotId === LEGACY_SLOT_ID) return;
    // The crate's own `join` waits for the seed too, but the slot check has
    // to come first: a slot read that has not finished looks like no slot.
    await this.waitUntil(
      () => this.manager.session().seeded,
      "the session seed",
    );
    if (this.manager.session().slotOpen === true) return;
    if (!slot.canOpen) throw new NoOpenSlotError();
    this.logger.info(
      `No open slot in the room; opening ${ELEMENT_CALL_SLOT_ID} (encrypted: ${slot.encrypted})`,
    );
    await this.manager.openSlot(ELEMENT_CALL_APPLICATION, slot.encrypted);
    // Open only once the homeserver has echoed the state back.
    await this.waitUntil(
      () => this.manager.session().slotOpen === true,
      "our slot event to echo back",
    );
  }

  private async waitUntil(
    condition: () => boolean,
    what: string,
  ): Promise<void> {
    const deadline = Date.now() + SLOT_WAIT_MS;
    while (!condition()) {
      if (this.ended) throw new Error("The participation has ended");
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** Leave the session. A no-op when not joined. */
  public async leave(code?: string, reason?: string): Promise<void> {
    if (this.ended) return;
    if (FfiStatus.Disconnected.instanceOf(this.manager.status())) return;
    try {
      await this.manager.leave(code, reason);
    } finally {
      this.refreshAll();
    }
  }

  /**
   * Change the call intent (`m.call.intent`) of our membership while
   * joined; the crate re-publishes it (C11). Rejects with the crate's
   * `NotJoined` error otherwise, which a caller that merely mirrors the
   * camera state can ignore.
   */
  public async updateApplication(intent: string | undefined): Promise<void> {
    if (this.ended) throw new Error("The participation has ended");
    await this.manager.updateApplication(intent);
  }

  /** The crate's diagnostics dump, for rageshakes. Not a UI contract. */
  public debugSnapshot(): string {
    return this.ended ? "{}" : this.manager.debugSnapshot();
  }

  private refreshOwnIdentity(): void {
    this.ownMemberIdSubject$.next(this.manager.ownMemberId() ?? null);
    this.ownTransportIdentitySubject$.next(
      this.manager.ownTransportIdentity() ?? null,
    );
  }

  /** After a join or leave the getters are fresh before any listener fires. */
  private refreshAll(): void {
    if (this.ended) return;
    this.statusSubject$.next(this.manager.status());
    this.membershipsSubject$.next(joinedOnly(this.manager.memberships()));
    this.connectionsSubject$.next(this.manager.connections());
    this.sessionSubject$.next(this.manager.session());
    this.refreshOwnIdentity();
  }

  private async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (!FfiStatus.Disconnected.instanceOf(this.manager.status())) {
      try {
        await this.manager.leave(undefined, undefined);
      } catch (e) {
        this.logger.warn("Could not leave the session cleanly", e);
      }
    }
    this.keyChangesSubject$.complete();
    this.manager.uniffiDestroy();
    this.matrixDriver.uniffiDestroy();
  }
}

function joinedOnly(memberships: FfiMembership[]): FfiMembership[] {
  return memberships.filter((m) => m.state === FfiMembershipState.Joined);
}

/**
 * Answers transport discovery with a configured LiveKit service URL when the
 * host's homeserver advertises none or cannot be asked — the precedence
 * Element Call has always had (homeserver first, `config.json` second) —
 * and delegates everything else to the host's driver untouched.
 */
class TransportFallbackDriver implements RtcMatrixDriver {
  public constructor(
    private readonly inner: RtcMatrixDriver,
    private readonly fallbackUrl: string,
    private readonly logger: Logger,
  ) {}

  public async getRtcTransports(): Promise<FfiRtcTransport[]> {
    let transports: FfiRtcTransport[] = [];
    try {
      transports = await this.inner.getRtcTransports();
    } catch (e) {
      this.logger.info(
        "Transport discovery failed; falling back to the configured LiveKit service",
        e,
      );
    }
    if (transports.some((t) => t.transportType === LIVEKIT_TRANSPORT_TYPE))
      return transports;
    this.logger.info(
      "The homeserver advertises no LiveKit transport; using the configured one",
    );
    return [
      {
        transportType: LIVEKIT_TRANSPORT_TYPE,
        propertiesJson: JSON.stringify({
          livekit_service_url: this.fallbackUrl,
        }),
      },
    ];
  }

  public async sendStickyEvent(
    roomId: string,
    eventType: string,
    contentJson: string,
    durationMs: bigint,
  ): Promise<FfiSendEventResponse> {
    return this.inner.sendStickyEvent(
      roomId,
      eventType,
      contentJson,
      durationMs,
    );
  }
  public async sendStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    contentJson: string,
  ): Promise<FfiSendEventResponse> {
    return this.inner.sendStateEvent(roomId, eventType, stateKey, contentJson);
  }
  public async sendDelayedEvent(
    roomId: string,
    eventType: string,
    contentJson: string,
    delayMs: bigint,
    stickyDurationMs: bigint | undefined,
  ): Promise<string> {
    return this.inner.sendDelayedEvent(
      roomId,
      eventType,
      contentJson,
      delayMs,
      stickyDurationMs,
    );
  }
  public async sendDelayedStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    contentJson: string,
    delayMs: bigint,
  ): Promise<string> {
    return this.inner.sendDelayedStateEvent(
      roomId,
      eventType,
      stateKey,
      contentJson,
      delayMs,
    );
  }
  public async restartDelayedEvent(
    roomId: string,
    delayId: string,
  ): Promise<void> {
    return this.inner.restartDelayedEvent(roomId, delayId);
  }
  public async cancelDelayedEvent(
    roomId: string,
    delayId: string,
  ): Promise<void> {
    return this.inner.cancelDelayedEvent(roomId, delayId);
  }
  public async delegateDelayedLeaveViaHomeserver(
    request: FfiHomeserverDelegationRequest,
  ): Promise<void> {
    return this.inner.delegateDelayedLeaveViaHomeserver(request);
  }
  public async delegateDelayedLeaveViaTransport(
    request: FfiTransportDelegationRequest,
  ): Promise<void> {
    return this.inner.delegateDelayedLeaveViaTransport(request);
  }
  public async sendToDevice(
    recipients: FfiToDeviceRecipient[],
    eventType: string,
    contentJson: string,
  ): Promise<FfiToDeviceDelivery[]> {
    return this.inner.sendToDevice(recipients, eventType, contentJson);
  }
  public async getLivekitToken(
    request: FfiLivekitTokenRequest,
  ): Promise<FfiLivekitToken> {
    return this.inner.getLivekitToken(request);
  }
  public async readEvents(
    eventType: string,
    stateKey: string | undefined,
    limit: number,
  ): Promise<string[]> {
    return this.inner.readEvents(eventType, stateKey, limit);
  }
  public async readState(
    eventType: string,
    stateKey: string | undefined,
  ): Promise<string[]> {
    return this.inner.readState(eventType, stateKey);
  }
  public subscribeRoomEvents(sink: RoomEventSinkLike): void {
    this.inner.subscribeRoomEvents(sink);
  }
  public subscribeToDeviceEvents(sink: ToDeviceSinkLike): void {
    this.inner.subscribeToDeviceEvents(sink);
  }
  public subscribeStateUpdates(sink: StateUpdateSinkLike): void {
    this.inner.subscribeStateUpdates(sink);
  }
  public subscribeConnectivity(sink: ConnectivitySinkLike): void {
    this.inner.subscribeConnectivity(sink);
  }
  public isHomeserverConnected(): boolean {
    return this.inner.isHomeserverConnected();
  }
}
