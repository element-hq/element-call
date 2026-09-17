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
  type FfiMediaKey,
  type FfiMembership,
  type FfiParticipationConfig,
  type FfiRtcTransport,
  type FfiSessionSnapshot,
  type FfiTransportIntent,
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

/** Media keys sent and received over a participation; see {@link CallParticipation.mediaKeyStatistics}. */
export interface MediaKeyStatistics {
  sent: number;
  received: number;
  /** Sum of the ages of the received keys on arrival, in ms. */
  receivedTotalAge: number;
}

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
 // TODO-RENAME: the call participationmanager wrapper represents the RtcParticipationManager
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
        : withTransportFallback(
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
        this.countKey(change);
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

  private readonly keyStatistics: MediaKeyStatistics = {
    sent: 0,
    received: 0,
    receivedTotalAge: 0,
  };

  private countKey(change: FfiMediaKey): void {
    if (change.memberId === this.manager.ownMemberId()) {
      this.keyStatistics.sent++;
    } else {
      this.keyStatistics.received++;
      this.keyStatistics.receivedTotalAge += Math.max(
        0,
        Date.now() - Number(change.creationTsMs),
      );
    }
  }

  /**
   * How many media keys this participation has sent and received so far,
   * and how old the received ones were on arrival (summed), for the
   * ended-call analytics. Counted from the crate's key changes: one of ours
   * per index we rotate to, one of theirs per key that reaches us.
   */
  public mediaKeyStatistics(): MediaKeyStatistics {
    return { ...this.keyStatistics };
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
 * A driver that behaves like `inner` except for the methods in `overrides`.
 * Everything else reaches `inner` untouched — every argument, including the
 * `asyncOpts_` abort signal the bindings pass last, and any method the
 * driver contract grows later — called on `inner` itself so that a method
 * reading its own fields still works.
 */
function overrideDriver(
  inner: RtcMatrixDriver,
  overrides: Partial<RtcMatrixDriver>,
): RtcMatrixDriver {
  return new Proxy(inner, {
    get: (target, property): unknown => {
      if (Object.hasOwn(overrides, property))
        return Reflect.get(overrides, property);
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Answers transport discovery with a configured LiveKit service URL when the
 * host's homeserver advertises none or cannot be asked — the precedence
 * Element Call has always had (homeserver first, `config.json` second) —
 * and delegates everything else to the host's driver untouched.
 */
function withTransportFallback(
  inner: RtcMatrixDriver,
  fallbackUrl: string,
  logger: Logger,
): RtcMatrixDriver {
  return overrideDriver(inner, {
    async getRtcTransports(): Promise<FfiRtcTransport[]> {
      let transports: FfiRtcTransport[] = [];
      try {
        transports = await inner.getRtcTransports();
      } catch (e) {
        logger.info(
          "Transport discovery failed; falling back to the configured LiveKit service",
          e,
        );
      }
      if (transports.some((t) => t.transportType === LIVEKIT_TRANSPORT_TYPE))
        return transports;
      logger.info(
        "The homeserver advertises no LiveKit transport; using the configured one",
      );
      return [
        {
          transportType: LIVEKIT_TRANSPORT_TYPE,
          propertiesJson: JSON.stringify({
            livekit_service_url: fallbackUrl,
          }),
        },
      ];
    },
  });
}
