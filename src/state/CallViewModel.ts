/*
Copyright 2023, 2024, 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type BaseKeyProvider,
  ConnectionState,
  type E2EEOptions,
  ExternalE2EEKeyProvider,
  type LocalParticipant,
  RemoteParticipant,
  type Room as LivekitRoom,
  type RoomOptions,
} from "livekit-client";
import E2EEWorker from "livekit-client/e2ee-worker?worker";
import {
  ClientEvent,
  type EventTimelineSetHandlerMap,
  EventType,
  type Room as MatrixRoom,
  RoomEvent,
  type RoomMember,
  RoomStateEvent,
  SyncState,
} from "matrix-js-sdk";
import { deepCompare } from "matrix-js-sdk/lib/utils";
import {
  BehaviorSubject,
  combineLatest,
  concat,
  distinctUntilChanged,
  EMPTY,
  endWith,
  filter,
  from,
  fromEvent,
  ignoreElements,
  map,
  merge,
  NEVER,
  type Observable,
  of,
  pairwise,
  race,
  repeat,
  scan,
  skip,
  skipWhile,
  startWith,
  Subject,
  switchAll,
  switchMap,
  switchScan,
  take,
  takeUntil,
  takeWhile,
  tap,
  throttleTime,
  timer,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  type CallMembership,
  isLivekitTransport,
  type LivekitTransport,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
  type MatrixRTCSessionEventHandlerMap,
  MembershipManagerEvent,
  Status,
} from "matrix-js-sdk/lib/matrixrtc";
import { type IWidgetApiRequest } from "matrix-widget-api";

import {
  LocalUserMediaViewModel,
  type MediaViewModel,
  type RemoteUserMediaViewModel,
  ScreenShareViewModel,
  type UserMediaViewModel,
} from "./MediaViewModel";
import {
  accumulate,
  and$,
  generateKeyed$,
  pauseWhen,
} from "../utils/observable";
import {
  duplicateTiles,
  multiSfu,
  playReactionsSound,
  preferStickyEvents,
  showReactions,
} from "../settings/settings";
import { isFirefox } from "../Platform";
import { setPipEnabled$ } from "../controls";
import { TileStore } from "./TileStore";
import { gridLikeLayout } from "./GridLikeLayout";
import { spotlightExpandedLayout } from "./SpotlightExpandedLayout";
import { oneOnOneLayout } from "./OneOnOneLayout";
import { pipLayout } from "./PipLayout";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import {
  type RaisedHandInfo,
  type ReactionInfo,
  type ReactionOption,
} from "../reactions";
import { shallowEquals } from "../utils/array";
import { calculateDisplayName, shouldDisambiguate } from "../utils/displayname";
import { type MediaDevices } from "./MediaDevices";
import { type Behavior, constant } from "./Behavior";
import {
  enterRTCSession,
  getLivekitAlias,
  makeTransport,
} from "../rtcSessionHelpers";
import { E2eeType } from "../e2ee/e2eeType";
import { MatrixKeyProvider } from "../e2ee/matrixKeyProvider";
import { type Connection, RemoteConnection } from "./Connection";
import { type MuteStates } from "./MuteStates";
import { getUrlParams } from "../UrlParams";
import { type ProcessorState } from "../livekit/TrackProcessorContext";
import { ElementWidgetActions, widget } from "../widget";
import { PublishConnection } from "./PublishConnection.ts";
import { type Async, async$, mapAsync, ready } from "./Async";
import { sharingScreen$, UserMedia } from "./UserMedia.ts";
import { ScreenShare } from "./ScreenShare.ts";
import {
  type GridLayoutMedia,
  type Layout,
  type LayoutMedia,
  type OneOnOneLayoutMedia,
  type SpotlightExpandedLayoutMedia,
  type SpotlightLandscapeLayoutMedia,
  type SpotlightPortraitLayoutMedia,
} from "./layout-types.ts";
import { ElementCallError, UnknownCallError } from "../utils/errors.ts";
import { ObservableScope } from "./ObservableScope.ts";

export interface CallViewModelOptions {
  encryptionSystem: EncryptionSystem;
  autoLeaveWhenOthersLeft?: boolean;
  /**
   * If the call is started in a way where we want it to behave like a telephone usecase
   * If we sent a notification event, we want the ui to show a ringing state
   */
  waitForCallPickup?: boolean;
  /** Optional factory to create LiveKit rooms, mainly for testing purposes. */
  livekitRoomFactory?: (options?: RoomOptions) => LivekitRoom;
  /** Optional behavior overriding the local connection state, mainly for testing purposes. */
  connectionState$?: Behavior<ConnectionState>;
}

// Do not play any sounds if the participant count has exceeded this
// number.
export const MAX_PARTICIPANT_COUNT_FOR_SOUND = 8;
export const THROTTLE_SOUND_EFFECT_MS = 500;

// This is the number of participants that we think constitutes a "small" call
// on mobile. No spotlight tile should be shown below this threshold.
const smallMobileCallThreshold = 3;

// How long the footer should be shown for when hovering over or interacting
// with the interface
const showFooterMs = 4000;

export type GridMode = "grid" | "spotlight";

export type WindowMode = "normal" | "narrow" | "flat" | "pip";

interface LayoutScanState {
  layout: Layout | null;
  tiles: TileStore;
}

type MediaItem = UserMedia | ScreenShare;

/**
 * A view model providing all the application logic needed to show the in-call
 * UI (may eventually be expanded to cover the lobby and feedback screens in the
 * future).
 */
// Throughout this class and related code we must distinguish between MatrixRTC
// state and LiveKit state. We use the common terminology of room "members", RTC
// "memberships", and LiveKit "participants".
export class CallViewModel {
  private readonly urlParams = getUrlParams();

  private readonly livekitAlias = getLivekitAlias(this.matrixRTCSession);

  private readonly livekitE2EEKeyProvider = getE2eeKeyProvider(
    this.options.encryptionSystem,
    this.matrixRTCSession,
  );
  private readonly e2eeLivekitOptions = (): E2EEOptions | undefined =>
    this.livekitE2EEKeyProvider
      ? {
          keyProvider: this.livekitE2EEKeyProvider,
          worker: new E2EEWorker(),
        }
      : undefined;

  private readonly _configError$ = new BehaviorSubject<ElementCallError | null>(
    null,
  );

  /**
   * If there is a configuration error with the call (e.g. misconfigured E2EE).
   * This is a fatal error that prevents the call from being created/joined.
   * Should render a blocking error screen.
   */
  public get configError$(): Behavior<ElementCallError | null> {
    return this._configError$;
  }

  private readonly join$ = new Subject<void>();

  public join(): void {
    this.join$.next();
  }

  // This is functionally the same Observable as leave$, except here it's
  // hoisted to the top of the class. This enables the cyclic dependency between
  // leave$ -> autoLeave$ -> callPickupState$ -> livekitConnectionState$ ->
  // localConnection$ -> transports$ -> joined$ -> leave$.
  private readonly leaveHoisted$ = new Subject<
    "user" | "timeout" | "decline" | "allOthersLeft"
  >();

  /**
   * Whether we are joined to the call. This reflects our local state rather
   * than whether all connections are truly up and running.
   */
  private readonly joined$ = this.scope.behavior(
    this.join$.pipe(
      map(() => true),
      // Using takeUntil with the repeat operator is perfectly valid.
      // eslint-disable-next-line rxjs/no-unsafe-takeuntil
      takeUntil(this.leaveHoisted$),
      endWith(false),
      repeat(),
      startWith(false),
    ),
  );

  /**
   * The MatrixRTC session participants.
   */
  // Note that MatrixRTCSession already filters the call memberships by users
  // that are joined to the room; we don't need to perform extra filtering here.
  private readonly memberships$ = this.scope.behavior(
    fromEvent(
      this.matrixRTCSession,
      MatrixRTCSessionEvent.MembershipsChanged,
    ).pipe(
      startWith(null),
      map(() => this.matrixRTCSession.memberships),
    ),
  );

  /**
   * The transport that we would personally prefer to publish on (if not for the
   * transport preferences of others, perhaps).
   */
  private readonly preferredTransport$ = this.scope.behavior(
    async$(makeTransport(this.matrixRTCSession)),
  );

  /**
   * Lists the transports used by ourselves, plus all other MatrixRTC session
   * members. For completeness this also lists the preferred transport and
   * whether we are in multi-SFU mode or sticky events mode (because
   * advertisedTransport$ wants to read them at the same time, and bundling data
   * together when it might change together is what you have to do in RxJS to
   * avoid reading inconsistent state or observing too many changes.)
   */
  // TODO-MULTI-SFU find a better name for this. with the addition of sticky events it's no longer just about transports.
  private readonly transports$: Behavior<{
    local: Async<LivekitTransport>;
    remote: { membership: CallMembership; transport: LivekitTransport }[];
    preferred: Async<LivekitTransport>;
    multiSfu: boolean;
    preferStickyEvents: boolean;
  } | null> = this.scope.behavior(
    this.joined$.pipe(
      switchMap((joined) =>
        joined
          ? combineLatest(
              [
                this.preferredTransport$,
                this.memberships$,
                multiSfu.value$,
                preferStickyEvents.value$,
              ],
              (preferred, memberships, preferMultiSfu, preferStickyEvents) => {
                // Multi-SFU must be implicitly enabled when using sticky events
                const multiSfu = preferStickyEvents || preferMultiSfu;

                const oldestMembership =
                  this.matrixRTCSession.getOldestMembership();
                const remote = memberships.flatMap((m) => {
                  if (m.userId === this.userId && m.deviceId === this.deviceId)
                    return [];
                  const t = m.getTransport(oldestMembership ?? m);
                  return t && isLivekitTransport(t)
                    ? [{ membership: m, transport: t }]
                    : [];
                });

                let local = preferred;
                if (!multiSfu) {
                  const oldest = this.matrixRTCSession.getOldestMembership();
                  if (oldest !== undefined) {
                    const selection = oldest.getTransport(oldest);
                    // TODO selection can be null if no transport is configured should we report an error?
                    if (selection && isLivekitTransport(selection))
                      local = ready(selection);
                  }
                }

                if (local.state === "error") {
                  this._configError$.next(
                    local.value instanceof ElementCallError
                      ? local.value
                      : new UnknownCallError(local.value),
                  );
                }

                return {
                  local,
                  remote,
                  preferred,
                  multiSfu,
                  preferStickyEvents,
                };
              },
            )
          : of(null),
      ),
    ),
  );

  /**
   * Lists the transports used by each MatrixRTC session member other than
   * ourselves.
   */
  private readonly remoteTransports$ = this.scope.behavior(
    this.transports$.pipe(map((transports) => transports?.remote ?? [])),
  );

  /**
   * The transport over which we should be actively publishing our media.
   * null when not joined.
   */
  private readonly localTransport$: Behavior<Async<LivekitTransport> | null> =
    this.scope.behavior(
      this.transports$.pipe(
        map((transports) => transports?.local ?? null),
        distinctUntilChanged<Async<LivekitTransport> | null>(deepCompare),
      ),
    );

  /**
   * The transport we should advertise in our MatrixRTC membership (plus whether
   * it is a multi-SFU transport and whether we should use sticky events).
   */
  private readonly advertisedTransport$: Behavior<{
    multiSfu: boolean;
    preferStickyEvents: boolean;
    transport: LivekitTransport;
  } | null> = this.scope.behavior(
    this.transports$.pipe(
      map((transports) =>
        transports?.local.state === "ready" &&
        transports.preferred.state === "ready"
          ? {
              multiSfu: transports.multiSfu,
              preferStickyEvents: transports.preferStickyEvents,
              // In non-multi-SFU mode we should always advertise the preferred
              // SFU to minimize the number of membership updates
              transport: transports.multiSfu
                ? transports.local.value
                : transports.preferred.value,
            }
          : null,
      ),
      distinctUntilChanged<{
        multiSfu: boolean;
        preferStickyEvents: boolean;
        transport: LivekitTransport;
      } | null>(deepCompare),
    ),
  );

  /**
   * The local connection over which we will publish our media. It could
   * possibly also have some remote users' media available on it.
   * null when not joined.
   */
  private readonly localConnection$: Behavior<Async<PublishConnection> | null> =
    this.scope.behavior(
      generateKeyed$<
        Async<LivekitTransport> | null,
        PublishConnection,
        Async<PublishConnection> | null
      >(
        this.localTransport$,
        (transport, createOrGet) =>
          transport &&
          mapAsync(transport, (transport) =>
            createOrGet(
              // Stable key that uniquely idenifies the transport
              JSON.stringify({
                url: transport.livekit_service_url,
                alias: transport.livekit_alias,
              }),
              (scope) =>
                new PublishConnection(
                  {
                    transport,
                    client: this.matrixRoom.client,
                    scope,
                    remoteTransports$: this.remoteTransports$,
                    livekitRoomFactory: this.options.livekitRoomFactory,
                  },
                  this.mediaDevices,
                  this.muteStates,
                  this.e2eeLivekitOptions(),
                  this.scope.behavior(this.trackProcessorState$),
                ),
            ),
          ),
      ),
    );

  public readonly livekitConnectionState$ =
    // TODO: This options.connectionState$ behavior is a small hack inserted
    // here to facilitate testing. This would likely be better served by
    // breaking CallViewModel down into more naturally testable components.
    this.options.connectionState$ ??
    this.scope.behavior<ConnectionState>(
      this.localConnection$.pipe(
        switchMap((c) =>
          c?.state === "ready"
            ? // TODO mapping to ConnectionState for compatibility, but we should use the full state?
              c.value.transportState$.pipe(
                switchMap((s) => {
                  if (s.state === "ConnectedToLkRoom")
                    return s.connectionState$;
                  return of(ConnectionState.Disconnected);
                }),
              )
            : of(ConnectionState.Disconnected),
        ),
      ),
    );

  /**
   * Connections for each transport in use by one or more session members that
   * is *distinct* from the local transport.
   */
  private readonly remoteConnections$ = this.scope.behavior(
    generateKeyed$<typeof this.transports$.value, Connection, Connection[]>(
      this.transports$,
      (transports, createOrGet) => {
        const connections: Connection[] = [];

        // Until the local transport becomes ready we have no idea which
        // transports will actually need a dedicated remote connection
        if (transports?.local.state === "ready") {
          // TODO: Handle custom transport.livekit_alias values here
          const localServiceUrl = transports.local.value.livekit_service_url;
          const remoteServiceUrls = new Set(
            transports.remote.map(
              ({ transport }) => transport.livekit_service_url,
            ),
          );
          remoteServiceUrls.delete(localServiceUrl);

          for (const remoteServiceUrl of remoteServiceUrls)
            connections.push(
              createOrGet(
                remoteServiceUrl,
                (scope) =>
                  new RemoteConnection(
                    {
                      transport: {
                        type: "livekit",
                        livekit_service_url: remoteServiceUrl,
                        livekit_alias: this.livekitAlias,
                      },
                      client: this.matrixRoom.client,
                      scope,
                      remoteTransports$: this.remoteTransports$,
                      livekitRoomFactory: this.options.livekitRoomFactory,
                    },
                    this.e2eeLivekitOptions(),
                  ),
              ),
            );
        }

        return connections;
      },
    ),
  );

  /**
   * A list of the connections that should be active at any given time.
   */
  private readonly connections$ = this.scope.behavior<Connection[]>(
    combineLatest(
      [this.localConnection$, this.remoteConnections$],
      (local, remote) => [
        ...(local?.state === "ready" ? [local.value] : []),
        ...remote.values(),
      ],
    ),
  );

  /**
   * Emits with connections whenever they should be started or stopped.
   */
  private readonly connectionInstructions$ = this.connections$.pipe(
    pairwise(),
    map(([prev, next]) => {
      const start = new Set(next.values());
      for (const connection of prev) start.delete(connection);
      const stop = new Set(prev.values());
      for (const connection of next) stop.delete(connection);

      return { start, stop };
    }),
  );

  public readonly allLivekitRooms$ = this.scope.behavior(
    this.connections$.pipe(
      map((connections) =>
        [...connections.values()].map((c) => ({
          room: c.livekitRoom,
          url: c.transport.livekit_service_url,
          isLocal: c instanceof PublishConnection,
        })),
      ),
    ),
  );

  private readonly userId = this.matrixRoom.client.getUserId()!;
  private readonly deviceId = this.matrixRoom.client.getDeviceId()!;

  /**
   * Whether we are connected to the MatrixRTC session.
   */
  private readonly matrixConnected$ = this.scope.behavior(
    // To consider ourselves connected to MatrixRTC, we check the following:
    and$(
      // The client is connected to the sync loop
      (
        fromEvent(this.matrixRoom.client, ClientEvent.Sync) as Observable<
          [SyncState]
        >
      ).pipe(
        startWith([this.matrixRoom.client.getSyncState()]),
        map(([state]) => state === SyncState.Syncing),
      ),
      // Room state observed by session says we're connected
      fromEvent(
        this.matrixRTCSession,
        MembershipManagerEvent.StatusChanged,
      ).pipe(
        startWith(null),
        map(() => this.matrixRTCSession.membershipStatus === Status.Connected),
      ),
      // Also watch out for warnings that we've likely hit a timeout and our
      // delayed leave event is being sent (this condition is here because it
      // provides an earlier warning than the sync loop timeout, and we wouldn't
      // see the actual leave event until we reconnect to the sync loop)
      fromEvent(
        this.matrixRTCSession,
        MembershipManagerEvent.ProbablyLeft,
      ).pipe(
        startWith(null),
        map(() => this.matrixRTCSession.probablyLeft !== true),
      ),
    ),
  );

  /**
   * Whether we are "fully" connected to the call. Accounts for both the
   * connection to the MatrixRTC session and the LiveKit publish connection.
   */
  private readonly connected$ = this.scope.behavior(
    and$(
      this.matrixConnected$,
      this.livekitConnectionState$.pipe(
        map((state) => state === ConnectionState.Connected),
      ),
    ),
  );

  /**
   * Whether we should tell the user that we're reconnecting to the call.
   */
  public readonly reconnecting$ = this.scope.behavior(
    this.connected$.pipe(
      // We are reconnecting if we previously had some successful initial
      // connection but are now disconnected
      scan(
        ({ connectedPreviously }, connectedNow) => ({
          connectedPreviously: connectedPreviously || connectedNow,
          reconnecting: connectedPreviously && !connectedNow,
        }),
        { connectedPreviously: false, reconnecting: false },
      ),
      map(({ reconnecting }) => reconnecting),
    ),
  );

  /**
   * Whether various media/event sources should pretend to be disconnected from
   * all network input, even if their connection still technically works.
   */
  // We do this when the app is in the 'reconnecting' state, because it might be
  // that the LiveKit connection is still functional while the homeserver is
  // down, for example, and we want to avoid making people worry that the app is
  // in a split-brained state.
  private readonly pretendToBeDisconnected$ = this.reconnecting$;

  /**
   * Lists, for each LiveKit room, the LiveKit participants whose media should
   * be presented.
   */
  private readonly participantsByRoom$ = this.scope.behavior<
    {
      livekitRoom: LivekitRoom;
      url: string; // Included for use as a React key
      participants: {
        id: string;
        participant: LocalParticipant | RemoteParticipant | undefined;
        member: RoomMember;
      }[];
    }[]
  >(
    // TODO: Move this logic into Connection/PublishConnection if possible
    this.localConnection$
      .pipe(
        switchMap((localConnection) => {
          if (localConnection?.state !== "ready") return [];
          const memberError = (): never => {
            throw new Error("No room member for call membership");
          };
          const localParticipant = {
            id: `${this.userId}:${this.deviceId}`,
            participant: localConnection.value.livekitRoom.localParticipant,
            member:
              this.matrixRoom.getMember(this.userId ?? "") ?? memberError(),
          };

          return this.remoteConnections$.pipe(
            switchMap((remoteConnections) =>
              combineLatest(
                [localConnection.value, ...remoteConnections].map((c) =>
                  c.publishingParticipants$.pipe(
                    map((ps) => {
                      const participants: {
                        id: string;
                        participant:
                          | LocalParticipant
                          | RemoteParticipant
                          | undefined;
                        member: RoomMember;
                      }[] = ps.map(({ participant, membership }) => ({
                        id: `${membership.userId}:${membership.deviceId}`,
                        participant,
                        member:
                          getRoomMemberFromRtcMember(
                            membership,
                            this.matrixRoom,
                          )?.member ?? memberError(),
                      }));
                      if (c === localConnection.value)
                        participants.push(localParticipant);

                      return {
                        livekitRoom: c.livekitRoom,
                        url: c.transport.livekit_service_url,
                        participants,
                      };
                    }),
                  ),
                ),
              ),
            ),
          );
        }),
      )
      .pipe(startWith([]), pauseWhen(this.pretendToBeDisconnected$)),
  );

  /**
   * Lists, for each LiveKit room, the LiveKit participants whose audio should
   * be rendered.
   */
  // (This is effectively just participantsByRoom$ with a stricter type)
  public readonly audioParticipants$ = this.scope.behavior(
    this.participantsByRoom$.pipe(
      map((data) =>
        data.map(({ livekitRoom, url, participants }) => ({
          livekitRoom,
          url,
          participants: participants.flatMap(({ participant }) =>
            participant instanceof RemoteParticipant ? [participant] : [],
          ),
        })),
      ),
    ),
  );

  /**
   * Displaynames for each member of the call. This will disambiguate
   * any displaynames that clashes with another member. Only members
   * joined to the call are considered here.
   */
  // It turns out that doing the disambiguation above is rather expensive on Safari (10x slower
  // than on Chrome/Firefox). This means it is important that we multicast the result so that we
  // don't do this work more times than we need to. This is achieved by converting to a behavior:
  public readonly memberDisplaynames$ = this.scope.behavior(
    combineLatest(
      [
        // Handle call membership changes
        this.memberships$,
        // Additionally handle display name changes (implicitly reacting to them)
        fromEvent(this.matrixRoom, RoomStateEvent.Members).pipe(
          startWith(null),
        ),
        // TODO: do we need: pauseWhen(this.pretendToBeDisconnected$),
      ],
      (memberships, _displaynames) => {
        const displaynameMap = new Map<string, string>([
          [
            `${this.userId}:${this.deviceId}`,
            this.matrixRoom.getMember(this.userId)?.rawDisplayName ??
              this.userId,
          ],
        ]);
        const room = this.matrixRoom;

        // We only consider RTC members for disambiguation as they are the only visible members.
        for (const rtcMember of memberships) {
          const matrixIdentifier = `${rtcMember.userId}:${rtcMember.deviceId}`;
          const { member } = getRoomMemberFromRtcMember(rtcMember, room);
          if (!member) {
            logger.error(
              "Could not find member for media id:",
              matrixIdentifier,
            );
            continue;
          }
          const disambiguate = shouldDisambiguate(member, memberships, room);
          displaynameMap.set(
            matrixIdentifier,
            calculateDisplayName(member, disambiguate),
          );
        }
        return displaynameMap;
      },
    ),
  );

  public readonly handsRaised$ = this.scope.behavior(
    this.handsRaisedSubject$.pipe(pauseWhen(this.pretendToBeDisconnected$)),
  );

  public readonly reactions$ = this.scope.behavior(
    this.reactionsSubject$.pipe(
      map((v) =>
        Object.fromEntries(
          Object.entries(v).map(([a, { reactionOption }]) => [
            a,
            reactionOption,
          ]),
        ),
      ),
      pauseWhen(this.pretendToBeDisconnected$),
    ),
  );

  /**
   * List of MediaItems that we want to have tiles for.
   */
  private readonly mediaItems$ = this.scope.behavior<MediaItem[]>(
    generateKeyed$<
      [typeof this.participantsByRoom$.value, number],
      MediaItem,
      MediaItem[]
    >(
      // Generate a collection of MediaItems from the list of expected (whether
      // present or missing) LiveKit participants.
      combineLatest([this.participantsByRoom$, duplicateTiles.value$]),
      ([participantsByRoom, duplicateTiles], createOrGet) => {
        const items: MediaItem[] = [];

        for (const { livekitRoom, participants, url } of participantsByRoom) {
          for (const { id, participant, member } of participants) {
            for (let i = 0; i < 1 + duplicateTiles; i++) {
              const mediaId = `${id}:${i}`;
              const item = createOrGet(
                mediaId,
                (scope) =>
                  // We create UserMedia with or without a participant.
                  // This will be the initial value of a BehaviourSubject.
                  // Once a participant appears we will update the BehaviourSubject. (see below)
                  new UserMedia(
                    scope,
                    mediaId,
                    member,
                    participant,
                    this.options.encryptionSystem,
                    livekitRoom,
                    url,
                    this.mediaDevices,
                    this.pretendToBeDisconnected$,
                    this.memberDisplaynames$.pipe(
                      map((m) => m.get(id) ?? "[👻]"),
                    ),
                    this.handsRaised$.pipe(map((v) => v[id]?.time ?? null)),
                    this.reactions$.pipe(map((v) => v[id] ?? undefined)),
                  ),
              );
              items.push(item);
              (item as UserMedia).updateParticipant(participant);

              if (participant?.isScreenShareEnabled) {
                const screenShareId = `${mediaId}:screen-share`;
                items.push(
                  createOrGet(
                    screenShareId,
                    (scope) =>
                      new ScreenShare(
                        scope,
                        screenShareId,
                        member,
                        participant,
                        this.options.encryptionSystem,
                        livekitRoom,
                        url,
                        this.pretendToBeDisconnected$,
                        this.memberDisplaynames$.pipe(
                          map((m) => m.get(id) ?? "[👻]"),
                        ),
                      ),
                  ),
                );
              }
            }
          }
        }

        return items;
      },
    ),
  );

  /**
   * List of MediaItems that we want to display, that are of type UserMedia
   */
  private readonly userMedia$ = this.scope.behavior<UserMedia[]>(
    this.mediaItems$.pipe(
      map((mediaItems) =>
        mediaItems.filter((m): m is UserMedia => m instanceof UserMedia),
      ),
    ),
  );

  public readonly joinSoundEffect$ = this.userMedia$.pipe(
    pairwise(),
    filter(
      ([prev, current]) =>
        current.length <= MAX_PARTICIPANT_COUNT_FOR_SOUND &&
        current.length > prev.length,
    ),
    map(() => {}),
    throttleTime(THROTTLE_SOUND_EFFECT_MS),
  );

  /**
   * The number of participants currently in the call.
   *
   *  - Each participant has a corresponding MatrixRTC membership state event
   *  - There can be multiple participants for one Matrix user if they join from
   *    multiple devices.
   */
  public readonly participantCount$ = this.scope.behavior(
    this.memberships$.pipe(map((ms) => ms.length)),
  );

  private readonly allOthersLeft$ = this.memberships$.pipe(
    pairwise(),
    filter(
      ([prev, current]) =>
        current.every((m) => m.userId === this.userId) &&
        prev.some((m) => m.userId !== this.userId),
    ),
    map(() => {}),
  );

  private readonly didSendCallNotification$ = fromEvent(
    this.matrixRTCSession,
    MatrixRTCSessionEvent.DidSendCallNotification,
  ) as Observable<
    Parameters<
      MatrixRTCSessionEventHandlerMap[MatrixRTCSessionEvent.DidSendCallNotification]
    >
  >;

  /**
   * Whenever the RTC session tells us that it intends to ring the remote
   * participant's devices, this emits an Observable tracking the current state of
   * that ringing process.
   */
  // This is a behavior since we need to store the latest state for when we subscribe to this after `didSendCallNotification$`
  // has already emitted but we still need the latest observable with a timeout timer that only gets created on after receiving `notificationEvent`.
  // A behavior will emit the latest observable with the running timer to new subscribers.
  // see also: callPickupState$ and in particular the line: `return this.ring$.pipe(mergeAll());` here we otherwise might get an EMPTY observable if
  // `ring$` would not be a behavior.
  private readonly ring$: Behavior<"ringing" | "timeout" | "decline" | null> =
    this.scope.behavior(
      this.didSendCallNotification$.pipe(
        filter(
          ([notificationEvent]) =>
            notificationEvent.notification_type === "ring",
        ),
        switchMap(([notificationEvent]) => {
          const lifetimeMs = notificationEvent?.lifetime ?? 0;
          return concat(
            lifetimeMs === 0
              ? // If no lifetime, skip the ring state
                of(null)
              : // Ring until lifetime ms have passed
                timer(lifetimeMs).pipe(
                  ignoreElements(),
                  startWith("ringing" as const),
                ),
            // The notification lifetime has timed out, meaning ringing has likely
            // stopped on all receiving clients.
            of("timeout" as const),
            // This makes sure we will not drop into the `endWith("decline" as const)` state
            NEVER,
          ).pipe(
            takeUntil(
              (
                fromEvent(this.matrixRoom, RoomEvent.Timeline) as Observable<
                  Parameters<EventTimelineSetHandlerMap[RoomEvent.Timeline]>
                >
              ).pipe(
                filter(
                  ([event]) =>
                    event.getType() === EventType.RTCDecline &&
                    event.getRelation()?.rel_type === "m.reference" &&
                    event.getRelation()?.event_id ===
                      notificationEvent.event_id &&
                    event.getSender() !== this.userId,
                ),
              ),
            ),
            endWith("decline" as const),
          );
        }),
      ),
      null,
    );

  /**
   * Whether some Matrix user other than ourself is joined to the call.
   */
  private readonly someoneElseJoined$ = this.memberships$.pipe(
    map((ms) => ms.some((m) => m.userId !== this.userId)),
  ) as Behavior<boolean>;

  /**
   * The current call pickup state of the call.
   *  - "unknown": The client has not yet sent the notification event. We don't know if it will because it first needs to send its own membership.
   *     Then we can conclude if we were the first one to join or not.
   *     This may also be set if we are disconnected.
   *  - "ringing": The call is ringing on other devices in this room (This client should give audiovisual feedback that this is happening).
   *  - "timeout": No-one picked up in the defined time this call should be ringing on others devices.
   *     The call failed. If desired this can be used as a trigger to exit the call.
   *  - "success": Someone else joined. The call is in a normal state. No audiovisual feedback.
   *  - null: EC is configured to never show any waiting for answer state.
   */
  public readonly callPickupState$: Behavior<
    "unknown" | "ringing" | "timeout" | "decline" | "success" | null
  > = this.options.waitForCallPickup
    ? this.scope.behavior<
        "unknown" | "ringing" | "timeout" | "decline" | "success"
      >(
        combineLatest(
          [this.livekitConnectionState$, this.someoneElseJoined$, this.ring$],
          (livekitConnectionState, someoneElseJoined, ring) => {
            if (livekitConnectionState === ConnectionState.Disconnected) {
              // Do not ring until we're connected.
              return "unknown" as const;
            } else if (someoneElseJoined) {
              return "success" as const;
            }
            // Show the ringing state of the most recent ringing attempt.
            // as long as we have not yet sent an RTC notification event, ring will be null -> callPickupState$ = unknown.
            return ring ?? ("unknown" as const);
          },
        ),
      )
    : constant(null);

  public readonly leaveSoundEffect$ = combineLatest([
    this.callPickupState$,
    this.userMedia$,
  ]).pipe(
    // Until the call is successful, do not play a leave sound.
    // If callPickupState$ is null, then we always play the sound as it will not conflict with a decline sound.
    skipWhile(([c]) => c !== null && c !== "success"),
    map(([, userMedia]) => userMedia),
    pairwise(),
    filter(
      ([prev, current]) =>
        current.length <= MAX_PARTICIPANT_COUNT_FOR_SOUND &&
        current.length < prev.length,
    ),
    map(() => {}),
    throttleTime(THROTTLE_SOUND_EFFECT_MS),
  );

  // Public for testing
  public readonly autoLeave$ = merge(
    this.options.autoLeaveWhenOthersLeft
      ? this.allOthersLeft$.pipe(map(() => "allOthersLeft" as const))
      : NEVER,
    this.callPickupState$.pipe(
      filter((state) => state === "timeout" || state === "decline"),
    ),
  );

  private readonly userHangup$ = new Subject<void>();
  public hangup(): void {
    this.userHangup$.next();
  }

  private readonly widgetHangup$ =
    widget === null
      ? NEVER
      : (
          fromEvent(
            widget.lazyActions,
            ElementWidgetActions.HangupCall,
          ) as Observable<CustomEvent<IWidgetApiRequest>>
        ).pipe(
          tap((ev) => {
            widget!.api.transport.reply(ev.detail, {});
          }),
        );

  public readonly leave$: Observable<
    "user" | "timeout" | "decline" | "allOthersLeft"
  > = merge(
    this.autoLeave$,
    merge(this.userHangup$, this.widgetHangup$).pipe(
      map(() => "user" as const),
    ),
  ).pipe(
    this.scope.share,
    tap((reason) => this.leaveHoisted$.next(reason)),
  );

  /**
   * List of MediaItems that we want to display, that are of type ScreenShare
   */
  private readonly screenShares$ = this.scope.behavior<ScreenShare[]>(
    this.mediaItems$.pipe(
      map((mediaItems) =>
        mediaItems.filter((m): m is ScreenShare => m instanceof ScreenShare),
      ),
    ),
  );

  private readonly spotlightSpeaker$ =
    this.scope.behavior<UserMediaViewModel | null>(
      this.userMedia$.pipe(
        switchMap((mediaItems) =>
          mediaItems.length === 0
            ? of([])
            : combineLatest(
                mediaItems.map((m) =>
                  m.vm.speaking$.pipe(map((s) => [m, s] as const)),
                ),
              ),
        ),
        scan<(readonly [UserMedia, boolean])[], UserMedia | undefined, null>(
          (prev, mediaItems) => {
            // Only remote users that are still in the call should be sticky
            const [stickyMedia, stickySpeaking] =
              (!prev?.vm.local && mediaItems.find(([m]) => m === prev)) || [];
            // Decide who to spotlight:
            // If the previous speaker is still speaking, stick with them rather
            // than switching eagerly to someone else
            return stickySpeaking
              ? stickyMedia!
              : // Otherwise, select any remote user who is speaking
                (mediaItems.find(([m, s]) => !m.vm.local && s)?.[0] ??
                  // Otherwise, stick with the person who was last speaking
                  stickyMedia ??
                  // Otherwise, spotlight an arbitrary remote user
                  mediaItems.find(([m]) => !m.vm.local)?.[0] ??
                  // Otherwise, spotlight the local user
                  mediaItems.find(([m]) => m.vm.local)?.[0]);
          },
          null,
        ),
        map((speaker) => speaker?.vm ?? null),
      ),
    );

  private readonly grid$ = this.scope.behavior<UserMediaViewModel[]>(
    this.userMedia$.pipe(
      switchMap((mediaItems) => {
        const bins = mediaItems.map((m) =>
          m.bin$.pipe(map((bin) => [m, bin] as const)),
        );
        // Sort the media by bin order and generate a tile for each one
        return bins.length === 0
          ? of([])
          : combineLatest(bins, (...bins) =>
              bins.sort(([, bin1], [, bin2]) => bin1 - bin2).map(([m]) => m.vm),
            );
      }),
      distinctUntilChanged(shallowEquals),
    ),
  );

  private readonly spotlight$ = this.scope.behavior<MediaViewModel[]>(
    this.screenShares$.pipe(
      switchMap((screenShares) => {
        if (screenShares.length > 0) {
          return of(screenShares.map((m) => m.vm));
        }

        return this.spotlightSpeaker$.pipe(
          map((speaker) => (speaker ? [speaker] : [])),
        );
      }),
      distinctUntilChanged<MediaViewModel[]>(shallowEquals),
    ),
  );

  private readonly pip$ = this.scope.behavior<UserMediaViewModel | null>(
    combineLatest([
      this.screenShares$,
      this.spotlightSpeaker$,
      this.mediaItems$,
    ]).pipe(
      switchMap(([screenShares, spotlight, mediaItems]) => {
        if (screenShares.length > 0) {
          return this.spotlightSpeaker$;
        }
        if (!spotlight || spotlight.local) {
          return of(null);
        }

        const localUserMedia = mediaItems.find(
          (m) => m.vm instanceof LocalUserMediaViewModel,
        ) as UserMedia | undefined;

        const localUserMediaViewModel = localUserMedia?.vm as
          | LocalUserMediaViewModel
          | undefined;

        if (!localUserMediaViewModel) {
          return of(null);
        }
        return localUserMediaViewModel.alwaysShow$.pipe(
          map((alwaysShow) => {
            if (alwaysShow) {
              return localUserMediaViewModel;
            }

            return null;
          }),
        );
      }),
    ),
  );

  private readonly hasRemoteScreenShares$: Observable<boolean> =
    this.spotlight$.pipe(
      map((spotlight) =>
        spotlight.some((vm) => !vm.local && vm instanceof ScreenShareViewModel),
      ),
      distinctUntilChanged(),
    );

  private readonly pipEnabled$ = this.scope.behavior(setPipEnabled$, false);

  private readonly naturalWindowMode$ = this.scope.behavior<WindowMode>(
    fromEvent(window, "resize").pipe(
      startWith(null),
      map(() => {
        const height = window.innerHeight;
        const width = window.innerWidth;
        if (height <= 400 && width <= 340) return "pip";
        // Our layouts for flat windows are better at adapting to a small width
        // than our layouts for narrow windows are at adapting to a small height,
        // so we give "flat" precedence here
        if (height <= 600) return "flat";
        if (width <= 600) return "narrow";
        return "normal";
      }),
    ),
  );

  /**
   * The general shape of the window.
   */
  public readonly windowMode$ = this.scope.behavior<WindowMode>(
    this.pipEnabled$.pipe(
      switchMap((pip) =>
        pip ? of<WindowMode>("pip") : this.naturalWindowMode$,
      ),
    ),
  );

  private readonly spotlightExpandedToggle$ = new Subject<void>();
  public readonly spotlightExpanded$ = this.scope.behavior<boolean>(
    this.spotlightExpandedToggle$.pipe(
      accumulate(false, (expanded) => !expanded),
    ),
  );

  private readonly gridModeUserSelection$ = new Subject<GridMode>();
  /**
   * The layout mode of the media tile grid.
   */
  public readonly gridMode$ =
    // If the user hasn't selected spotlight and somebody starts screen sharing,
    // automatically switch to spotlight mode and reset when screen sharing ends
    this.scope.behavior<GridMode>(
      this.gridModeUserSelection$.pipe(
        startWith(null),
        switchMap((userSelection) =>
          (userSelection === "spotlight"
            ? EMPTY
            : combineLatest([
                this.hasRemoteScreenShares$,
                this.windowMode$,
              ]).pipe(
                skip(userSelection === null ? 0 : 1),
                map(
                  ([hasScreenShares, windowMode]): GridMode =>
                    hasScreenShares || windowMode === "flat"
                      ? "spotlight"
                      : "grid",
                ),
              )
          ).pipe(startWith(userSelection ?? "grid")),
        ),
      ),
    );

  public setGridMode(value: GridMode): void {
    this.gridModeUserSelection$.next(value);
  }

  private readonly gridLayoutMedia$: Observable<GridLayoutMedia> =
    combineLatest([this.grid$, this.spotlight$], (grid, spotlight) => ({
      type: "grid",
      spotlight: spotlight.some((vm) => vm instanceof ScreenShareViewModel)
        ? spotlight
        : undefined,
      grid,
    }));

  private readonly spotlightLandscapeLayoutMedia$: Observable<SpotlightLandscapeLayoutMedia> =
    combineLatest([this.grid$, this.spotlight$], (grid, spotlight) => ({
      type: "spotlight-landscape",
      spotlight,
      grid,
    }));

  private readonly spotlightPortraitLayoutMedia$: Observable<SpotlightPortraitLayoutMedia> =
    combineLatest([this.grid$, this.spotlight$], (grid, spotlight) => ({
      type: "spotlight-portrait",
      spotlight,
      grid,
    }));

  private readonly spotlightExpandedLayoutMedia$: Observable<SpotlightExpandedLayoutMedia> =
    combineLatest([this.spotlight$, this.pip$], (spotlight, pip) => ({
      type: "spotlight-expanded",
      spotlight,
      pip: pip ?? undefined,
    }));

  private readonly oneOnOneLayoutMedia$: Observable<OneOnOneLayoutMedia | null> =
    this.mediaItems$.pipe(
      map((mediaItems) => {
        if (mediaItems.length !== 2) return null;
        const local = mediaItems.find((vm) => vm.vm.local)?.vm as
          | LocalUserMediaViewModel
          | undefined;
        const remote = mediaItems.find((vm) => !vm.vm.local)?.vm as
          | RemoteUserMediaViewModel
          | undefined;
        // There might not be a remote tile if there are screen shares, or if
        // only the local user is in the call and they're using the duplicate
        // tiles option
        if (!remote || !local) return null;

        return { type: "one-on-one", local, remote };
      }),
    );

  private readonly pipLayoutMedia$: Observable<LayoutMedia> =
    this.spotlight$.pipe(map((spotlight) => ({ type: "pip", spotlight })));

  /**
   * The media to be used to produce a layout.
   */
  private readonly layoutMedia$ = this.scope.behavior<LayoutMedia>(
    this.windowMode$.pipe(
      switchMap((windowMode) => {
        switch (windowMode) {
          case "normal":
            return this.gridMode$.pipe(
              switchMap((gridMode) => {
                switch (gridMode) {
                  case "grid":
                    return this.oneOnOneLayoutMedia$.pipe(
                      switchMap((oneOnOne) =>
                        oneOnOne === null
                          ? this.gridLayoutMedia$
                          : of(oneOnOne),
                      ),
                    );
                  case "spotlight":
                    return this.spotlightExpanded$.pipe(
                      switchMap((expanded) =>
                        expanded
                          ? this.spotlightExpandedLayoutMedia$
                          : this.spotlightLandscapeLayoutMedia$,
                      ),
                    );
                }
              }),
            );
          case "narrow":
            return this.oneOnOneLayoutMedia$.pipe(
              switchMap((oneOnOne) =>
                oneOnOne === null
                  ? combineLatest(
                      [this.grid$, this.spotlight$],
                      (grid, spotlight) =>
                        grid.length > smallMobileCallThreshold ||
                        spotlight.some(
                          (vm) => vm instanceof ScreenShareViewModel,
                        )
                          ? this.spotlightPortraitLayoutMedia$
                          : this.gridLayoutMedia$,
                    ).pipe(switchAll())
                  : // The expanded spotlight layout makes for a better one-on-one
                    // experience in narrow windows
                    this.spotlightExpandedLayoutMedia$,
              ),
            );
          case "flat":
            return this.gridMode$.pipe(
              switchMap((gridMode) => {
                switch (gridMode) {
                  case "grid":
                    // Yes, grid mode actually gets you a "spotlight" layout in
                    // this window mode.
                    return this.spotlightLandscapeLayoutMedia$;
                  case "spotlight":
                    return this.spotlightExpandedLayoutMedia$;
                }
              }),
            );
          case "pip":
            return this.pipLayoutMedia$;
        }
      }),
    ),
  );

  // There is a cyclical dependency here: the layout algorithms want to know
  // which tiles are on screen, but to know which tiles are on screen we have to
  // first render a layout. To deal with this we assume initially that no tiles
  // are visible, and loop the data back into the layouts with a Subject.
  private readonly visibleTiles$ = new Subject<number>();
  private readonly setVisibleTiles = (value: number): void =>
    this.visibleTiles$.next(value);

  private readonly layoutInternals$ = this.scope.behavior<
    LayoutScanState & { layout: Layout }
  >(
    combineLatest([
      this.layoutMedia$,
      this.visibleTiles$.pipe(startWith(0), distinctUntilChanged()),
    ]).pipe(
      scan<
        [LayoutMedia, number],
        LayoutScanState & { layout: Layout },
        LayoutScanState
      >(
        ({ tiles: prevTiles }, [media, visibleTiles]) => {
          let layout: Layout;
          let newTiles: TileStore;
          switch (media.type) {
            case "grid":
            case "spotlight-landscape":
            case "spotlight-portrait":
              [layout, newTiles] = gridLikeLayout(
                media,
                visibleTiles,
                this.setVisibleTiles,
                prevTiles,
              );
              break;
            case "spotlight-expanded":
              [layout, newTiles] = spotlightExpandedLayout(media, prevTiles);
              break;
            case "one-on-one":
              [layout, newTiles] = oneOnOneLayout(media, prevTiles);
              break;
            case "pip":
              [layout, newTiles] = pipLayout(media, prevTiles);
              break;
          }

          return { layout, tiles: newTiles };
        },
        { layout: null, tiles: TileStore.empty() },
      ),
    ),
  );

  /**
   * The layout of tiles in the call interface.
   */
  public readonly layout$ = this.scope.behavior<Layout>(
    this.layoutInternals$.pipe(map(({ layout }) => layout)),
  );

  /**
   * The current generation of the tile store, exposed for debugging purposes.
   */
  public readonly tileStoreGeneration$ = this.scope.behavior<number>(
    this.layoutInternals$.pipe(map(({ tiles }) => tiles.generation)),
  );

  public showSpotlightIndicators$ = this.scope.behavior<boolean>(
    this.layout$.pipe(map((l) => l.type !== "grid")),
  );

  public showSpeakingIndicators$ = this.scope.behavior<boolean>(
    this.layout$.pipe(
      switchMap((l) => {
        switch (l.type) {
          case "spotlight-landscape":
          case "spotlight-portrait":
            // If the spotlight is showing the active speaker, we can do without
            // speaking indicators as they're a redundant visual cue. But if
            // screen sharing feeds are in the spotlight we still need them.
            return l.spotlight.media$.pipe(
              map((models: MediaViewModel[]) =>
                models.some((m) => m instanceof ScreenShareViewModel),
              ),
            );
          // In expanded spotlight layout, the active speaker is always shown in
          // the picture-in-picture tile so there is no need for speaking
          // indicators. And in one-on-one layout there's no question as to who is
          // speaking.
          case "spotlight-expanded":
          case "one-on-one":
            return of(false);
          default:
            return of(true);
        }
      }),
    ),
  );

  public readonly toggleSpotlightExpanded$ = this.scope.behavior<
    (() => void) | null
  >(
    this.windowMode$.pipe(
      switchMap((mode) =>
        mode === "normal"
          ? this.layout$.pipe(
              map(
                (l) =>
                  l.type === "spotlight-landscape" ||
                  l.type === "spotlight-expanded",
              ),
            )
          : of(false),
      ),
      distinctUntilChanged(),
      map((enabled) =>
        enabled ? (): void => this.spotlightExpandedToggle$.next() : null,
      ),
    ),
  );

  private readonly screenTap$ = new Subject<void>();
  private readonly controlsTap$ = new Subject<void>();
  private readonly screenHover$ = new Subject<void>();
  private readonly screenUnhover$ = new Subject<void>();

  /**
   * Callback for when the user taps the call view.
   */
  public tapScreen(): void {
    this.screenTap$.next();
  }

  /**
   * Callback for when the user taps the call's controls.
   */
  public tapControls(): void {
    this.controlsTap$.next();
  }

  /**
   * Callback for when the user hovers over the call view.
   */
  public hoverScreen(): void {
    this.screenHover$.next();
  }

  /**
   * Callback for when the user stops hovering over the call view.
   */
  public unhoverScreen(): void {
    this.screenUnhover$.next();
  }

  public readonly showHeader$ = this.scope.behavior<boolean>(
    this.windowMode$.pipe(map((mode) => mode !== "pip" && mode !== "flat")),
  );

  public readonly showFooter$ = this.scope.behavior<boolean>(
    this.windowMode$.pipe(
      switchMap((mode) => {
        switch (mode) {
          case "pip":
            return of(false);
          case "normal":
          case "narrow":
            return of(true);
          case "flat":
            // Sadly Firefox has some layering glitches that prevent the footer
            // from appearing properly. They happen less often if we never hide
            // the footer.
            if (isFirefox()) return of(true);
            // Show/hide the footer in response to interactions
            return merge(
              this.screenTap$.pipe(map(() => "tap screen" as const)),
              this.controlsTap$.pipe(map(() => "tap controls" as const)),
              this.screenHover$.pipe(map(() => "hover" as const)),
            ).pipe(
              switchScan((state, interaction) => {
                switch (interaction) {
                  case "tap screen":
                    return state
                      ? // Toggle visibility on tap
                        of(false)
                      : // Hide after a timeout
                        timer(showFooterMs).pipe(
                          map(() => false),
                          startWith(true),
                        );
                  case "tap controls":
                    // The user is interacting with things, so reset the timeout
                    return timer(showFooterMs).pipe(
                      map(() => false),
                      startWith(true),
                    );
                  case "hover":
                    // Show on hover and hide after a timeout
                    return race(
                      timer(showFooterMs),
                      this.screenUnhover$.pipe(take(1)),
                    ).pipe(
                      map(() => false),
                      startWith(true),
                    );
                }
              }, false),
              startWith(false),
            );
        }
      }),
    ),
  );

  /**
   * Whether audio is currently being output through the earpiece.
   */
  public readonly earpieceMode$ = this.scope.behavior<boolean>(
    combineLatest(
      [
        this.mediaDevices.audioOutput.available$,
        this.mediaDevices.audioOutput.selected$,
      ],
      (available, selected) =>
        selected !== undefined &&
        available.get(selected.id)?.type === "earpiece",
    ),
  );

  /**
   * Callback to toggle between the earpiece and the loudspeaker.
   *
   * This will be `null` in case the target does not exist in the list
   * of available audio outputs.
   */
  public readonly audioOutputSwitcher$ = this.scope.behavior<{
    targetOutput: "earpiece" | "speaker";
    switch: () => void;
  } | null>(
    combineLatest(
      [
        this.mediaDevices.audioOutput.available$,
        this.mediaDevices.audioOutput.selected$,
      ],
      (available, selected) => {
        const selectionType = selected && available.get(selected.id)?.type;

        // If we are in any output mode other than speaker switch to speaker.
        const newSelectionType: "earpiece" | "speaker" =
          selectionType === "speaker" ? "earpiece" : "speaker";
        const newSelection = [...available].find(
          ([, d]) => d.type === newSelectionType,
        );
        if (newSelection === undefined) return null;

        const [id] = newSelection;
        return {
          targetOutput: newSelectionType,
          switch: (): void => this.mediaDevices.audioOutput.select(id),
        };
      },
    ),
  );

  /**
   * Emits an array of reactions that should be visible on the screen.
   */
  public readonly visibleReactions$ = this.scope.behavior(
    showReactions.value$.pipe(
      switchMap((show) => (show ? this.reactions$ : of({}))),
      scan<
        Record<string, ReactionOption>,
        { sender: string; emoji: string; startX: number }[]
      >((acc, latest) => {
        const newSet: { sender: string; emoji: string; startX: number }[] = [];
        for (const [sender, reaction] of Object.entries(latest)) {
          const startX =
            acc.find((v) => v.sender === sender && v.emoji)?.startX ??
            Math.ceil(Math.random() * 80) + 10;
          newSet.push({ sender, emoji: reaction.emoji, startX });
        }
        return newSet;
      }, []),
    ),
  );

  /**
   * Emits an array of reactions that should be played.
   */
  public readonly audibleReactions$ = playReactionsSound.value$.pipe(
    switchMap((show) =>
      show ? this.reactions$ : of<Record<string, ReactionOption>>({}),
    ),
    map((reactions) => Object.values(reactions).map((v) => v.name)),
    scan<string[], { playing: string[]; newSounds: string[] }>(
      (acc, latest) => {
        return {
          playing: latest.filter(
            (v) => acc.playing.includes(v) || acc.newSounds.includes(v),
          ),
          newSounds: latest.filter(
            (v) => !acc.playing.includes(v) && !acc.newSounds.includes(v),
          ),
        };
      },
      { playing: [], newSounds: [] },
    ),
    map((v) => v.newSounds),
  );

  /**
   * Emits an event every time a new hand is raised in
   * the call.
   */
  public readonly newHandRaised$ = this.handsRaised$.pipe(
    map((v) => Object.keys(v).length),
    scan(
      (acc, newValue) => ({
        value: newValue,
        playSounds: newValue > acc.value,
      }),
      { value: 0, playSounds: false },
    ),
    filter((v) => v.playSounds),
  );

  /**
   * Emits an event every time a new screenshare is started in
   * the call.
   */
  public readonly newScreenShare$ = this.screenShares$.pipe(
    map((v) => v.length),
    scan(
      (acc, newValue) => ({
        value: newValue,
        playSounds: newValue > acc.value,
      }),
      { value: 0, playSounds: false },
    ),
    filter((v) => v.playSounds),
  );

  /**
   * Whether we are sharing our screen.
   */
  public readonly sharingScreen$ = this.scope.behavior(
    from(this.localConnection$).pipe(
      switchMap((c) =>
        c?.state === "ready"
          ? sharingScreen$(c.value.livekitRoom.localParticipant)
          : of(false),
      ),
    ),
  );

  /**
   * Callback for toggling screen sharing. If null, screen sharing is not
   * available.
   */
  public readonly toggleScreenSharing =
    "getDisplayMedia" in (navigator.mediaDevices ?? {}) &&
    !this.urlParams.hideScreensharing
      ? (): void =>
          // Once a connection is ready...
          void this.localConnection$
            .pipe(
              takeWhile((c) => c !== null && c.state !== "error"),
              switchMap((c) => (c.state === "ready" ? of(c.value) : NEVER)),
              take(1),
              this.scope.bind(),
            )
            // ...toggle screen sharing.
            .subscribe(
              (c) =>
                void c.livekitRoom.localParticipant
                  .setScreenShareEnabled(!this.sharingScreen$.value, {
                    audio: true,
                    selfBrowserSurface: "include",
                    surfaceSwitching: "include",
                    systemAudio: "include",
                  })
                  .catch(logger.error),
            )
      : null;

  public constructor(
    private readonly scope: ObservableScope,
    // A call is permanently tied to a single Matrix room
    private readonly matrixRTCSession: MatrixRTCSession,
    private readonly matrixRoom: MatrixRoom,
    private readonly mediaDevices: MediaDevices,
    private readonly muteStates: MuteStates,
    private readonly options: CallViewModelOptions,
    private readonly handsRaisedSubject$: Observable<
      Record<string, RaisedHandInfo>
    >,
    private readonly reactionsSubject$: Observable<
      Record<string, ReactionInfo>
    >,
    private readonly trackProcessorState$: Observable<ProcessorState>,
  ) {
    // Start and stop local and remote connections as needed
    this.connectionInstructions$
      .pipe(this.scope.bind())
      .subscribe(({ start, stop }) => {
        for (const c of stop) {
          logger.info(`Disconnecting from ${c.transport.livekit_service_url}`);
          c.stop().catch((err) => {
            // TODO: better error handling
            logger.error(
              `Fail to stop connection to ${c.transport.livekit_service_url}`,
              err,
            );
          });
        }
        for (const c of start) {
          c.start().then(
            () =>
              logger.info(`Connected to ${c.transport.livekit_service_url}`),
            (e) => {
              // We only want to report fatal errors `_configError$` for the publish connection.
              // If there is an error with another connection, it will not terminate the call and will be displayed
              // on eacn tile.
              if (
                c instanceof PublishConnection &&
                e instanceof ElementCallError
              ) {
                this._configError$.next(e);
              }
              logger.error(
                `Failed to start connection to ${c.transport.livekit_service_url}`,
                e,
              );
            },
          );
        }
      });

    // Start and stop session membership as needed
    this.scope.reconcile(this.advertisedTransport$, async (advertised) => {
      if (advertised !== null) {
        try {
          this._configError$.next(null);
          await enterRTCSession(this.matrixRTCSession, advertised.transport, {
            encryptMedia: this.options.encryptionSystem.kind !== E2eeType.NONE,
            useMultiSfu: advertised.multiSfu,
            preferStickyEvents: advertised.preferStickyEvents,
          });
        } catch (e) {
          logger.error("Error entering RTC session", e);
        }

        // Update our member event when our mute state changes.
        const intentScope = new ObservableScope();
        intentScope.reconcile(
          this.muteStates.video.enabled$,
          async (videoEnabled) =>
            this.matrixRTCSession.updateCallIntent(
              videoEnabled ? "video" : "audio",
            ),
        );

        return async (): Promise<void> => {
          intentScope.end();
          // Only sends Matrix leave event. The LiveKit session will disconnect
          // as soon as either the stopConnection$ handler above gets to it or
          // the view model is destroyed.
          try {
            await this.matrixRTCSession.leaveRoomSession();
          } catch (e) {
            logger.error("Error leaving RTC session", e);
          }
          try {
            await widget?.api.transport.send(
              ElementWidgetActions.HangupCall,
              {},
            );
          } catch (e) {
            logger.error("Failed to send hangup action", e);
          }
        };
      }
    });

    // Pause upstream of all local media tracks when we're disconnected from
    // MatrixRTC, because it can be an unpleasant surprise for the app to say
    // 'reconnecting' and yet still be transmitting your media to others.
    // We use matrixConnected$ rather than reconnecting$ because we want to
    // pause tracks during the initial joining sequence too until we're sure
    // that our own media is displayed on screen.
    combineLatest([this.localConnection$, this.matrixConnected$])
      .pipe(this.scope.bind())
      .subscribe(([connection, connected]) => {
        if (connection?.state !== "ready") return;
        const publications =
          connection.value.livekitRoom.localParticipant.trackPublications.values();
        if (connected) {
          for (const p of publications) {
            if (p.track?.isUpstreamPaused === true) {
              const kind = p.track.kind;
              logger.log(
                `Resuming ${kind} track (MatrixRTC connection present)`,
              );
              p.track
                .resumeUpstream()
                .catch((e) =>
                  logger.error(
                    `Failed to resume ${kind} track after MatrixRTC reconnection`,
                    e,
                  ),
                );
            }
          }
        } else {
          for (const p of publications) {
            if (p.track?.isUpstreamPaused === false) {
              const kind = p.track.kind;
              logger.log(
                `Pausing ${kind} track (uncertain MatrixRTC connection)`,
              );
              p.track
                .pauseUpstream()
                .catch((e) =>
                  logger.error(
                    `Failed to pause ${kind} track after entering uncertain MatrixRTC connection`,
                    e,
                  ),
                );
            }
          }
        }
      });

    // Join automatically
    this.join(); // TODO-MULTI-SFU: Use this view model for the lobby as well, and only call this once 'join' is clicked?
  }
}

// TODO-MULTI-SFU   // Setup and update the keyProvider which was create by `createRoom` was a thing before. Now we never update if the E2EEsystem changes
// do we need this?

function getE2eeKeyProvider(
  e2eeSystem: EncryptionSystem,
  rtcSession: MatrixRTCSession,
): BaseKeyProvider | undefined {
  if (e2eeSystem.kind === E2eeType.NONE) return undefined;

  if (e2eeSystem.kind === E2eeType.PER_PARTICIPANT) {
    const keyProvider = new MatrixKeyProvider();
    keyProvider.setRTCSession(rtcSession);
    return keyProvider;
  } else if (e2eeSystem.kind === E2eeType.SHARED_KEY && e2eeSystem.secret) {
    const keyProvider = new ExternalE2EEKeyProvider();
    keyProvider
      .setKey(e2eeSystem.secret)
      .catch((e) => logger.error("Failed to set shared key for E2EE", e));
    return keyProvider;
  }
}

function getRoomMemberFromRtcMember(
  rtcMember: CallMembership,
  room: MatrixRoom,
): { id: string; member: RoomMember | undefined } {
  return {
    id: rtcMember.userId + ":" + rtcMember.deviceId,
    member: room.getMember(rtcMember.userId) ?? undefined,
  };
}
