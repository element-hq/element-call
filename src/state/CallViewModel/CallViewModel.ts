/*
Copyright 2023, 2024, 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type BaseKeyProvider,
  type ConnectionState,
  type E2EEOptions,
  ExternalE2EEKeyProvider,
  type Room as LivekitRoom,
  type RoomOptions,
} from "livekit-client";
import E2EEWorker from "livekit-client/e2ee-worker?worker";
import { type Room as MatrixRoom } from "matrix-js-sdk";
import {
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  filter,
  fromEvent,
  map,
  merge,
  NEVER,
  type Observable,
  of,
  pairwise,
  race,
  scan,
  skip,
  skipWhile,
  startWith,
  Subject,
  switchAll,
  switchMap,
  switchScan,
  take,
  tap,
  throttleTime,
  timer,
} from "rxjs";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";
import { type IWidgetApiRequest } from "matrix-widget-api";

import {
  LocalUserMediaViewModel,
  type MediaViewModel,
  type RemoteUserMediaViewModel,
  ScreenShareViewModel,
  type UserMediaViewModel,
} from "../MediaViewModel";
import { accumulate, generateKeyed$, pauseWhen } from "../../utils/observable";
import {
  duplicateTiles,
  MatrixRTCMode,
  matrixRTCMode,
  playReactionsSound,
  showReactions,
} from "../../settings/settings";
import { isFirefox } from "../../Platform";
import { setPipEnabled$ } from "../../controls";
import { TileStore } from "../TileStore";
import { gridLikeLayout } from "../GridLikeLayout";
import { spotlightExpandedLayout } from "../SpotlightExpandedLayout";
import { oneOnOneLayout } from "../OneOnOneLayout";
import { pipLayout } from "../PipLayout";
import { type EncryptionSystem } from "../../e2ee/sharedKeyManagement";
import {
  type RaisedHandInfo,
  type ReactionInfo,
  type ReactionOption,
} from "../../reactions";
import { shallowEquals } from "../../utils/array";
import { type MediaDevices } from "../MediaDevices";
import { type Behavior, constant } from "../Behavior";
import { E2eeType } from "../../e2ee/e2eeType";
import { MatrixKeyProvider } from "../../e2ee/matrixKeyProvider";
import { type MuteStates } from "../MuteStates";
import { getUrlParams } from "../../UrlParams";
import { type ProcessorState } from "../../livekit/TrackProcessorContext";
import { ElementWidgetActions, widget } from "../../widget";
import { UserMedia } from "../UserMedia.ts";
import { ScreenShare } from "../ScreenShare.ts";
import {
  type GridLayoutMedia,
  type Layout,
  type LayoutMedia,
  type OneOnOneLayoutMedia,
  type SpotlightExpandedLayoutMedia,
  type SpotlightLandscapeLayoutMedia,
  type SpotlightPortraitLayoutMedia,
} from "../layout-types.ts";
import { type ElementCallError } from "../../utils/errors.ts";
import { type ObservableScope } from "../ObservableScope.ts";
import { createLocalMembership$ } from "./localMember/LocalMembership.ts";
import { createLocalTransport$ } from "./localMember/LocalTransport.ts";
import {
  createMemberships$,
  membershipsAndTransports$,
} from "../SessionBehaviors.ts";
import { ECConnectionFactory } from "./remoteMembers/ConnectionFactory.ts";
import { createConnectionManager$ } from "./remoteMembers/ConnectionManager.ts";
import { createMatrixLivekitMembers$ } from "./remoteMembers/MatrixLivekitMembers.ts";
import {
  createCallNotificationLifecycle$,
  createReceivedDecline$,
  createSentCallNotification$,
} from "./CallNotificationLifecycle.ts";
import { createRoomMembers$ } from "./remoteMembers/displayname.ts";

const logger = rootLogger.getChild("[CallViewModel]");
//TODO
// Larger rename
// member,membership -> rtcMember
// participant -> livekitParticipant
// matrixLivekitItem -> callMember
// js-sdk
// callMembership -> rtcMembership
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
type AudioLivekitItem = {
  livekitRoom: LivekitRoom;
  participants: string[];
  url: string;
};
/**
 * A view model providing all the application logic needed to show the in-call
 * UI (may eventually be expanded to cover the lobby and feedback screens in the
 * future).
 */
// Throughout this class and related code we must distinguish between MatrixRTC
// state and LiveKit state. We use the common terminology of room "members", RTC
// "memberships", and LiveKit "participants".
export class CallViewModel {
  private readonly userId = this.matrixRoom.client.getUserId()!;
  private readonly deviceId = this.matrixRoom.client.getDeviceId()!;

  private readonly livekitE2EEKeyProvider = getE2eeKeyProvider(
    this.options.encryptionSystem,
    this.matrixRTCSession,
  );

  private readonly e2eeLivekitOptions: E2EEOptions | undefined = this
    .livekitE2EEKeyProvider
    ? {
        keyProvider: this.livekitE2EEKeyProvider,
        worker: new E2EEWorker(),
      }
    : undefined;

  private memberships$ = createMemberships$(this.scope, this.matrixRTCSession);

  private membershipsAndTransports = membershipsAndTransports$(
    this.scope,
    this.memberships$,
  );

  private localTransport$ = createLocalTransport$({
    scope: this.scope,
    memberships$: this.memberships$,
    client: this.matrixRoom.client,
    roomId: this.matrixRoom.roomId,
    useOldestMember$: this.scope.behavior(
      matrixRTCMode.value$.pipe(map((v) => v === MatrixRTCMode.Legacy)),
    ),
  });

  // ------------------------------------------------------------------------

  private connectionFactory = new ECConnectionFactory(
    this.matrixRoom.client,
    this.mediaDevices,
    this.trackProcessorState$,
    this.e2eeLivekitOptions,
    getUrlParams().controlledAudioDevices,
  );

  // Can contain duplicates. The connection manager will take care of this.
  private allTransports$ = this.scope.behavior(
    combineLatest(
      [this.localTransport$, this.membershipsAndTransports.transports$],
      (localTransport, transports) => {
        const localTransportAsArray = localTransport ? [localTransport] : [];
        return transports.mapInner((transports) => [
          ...localTransportAsArray,
          ...transports,
        ]);
      },
    ),
  );

  private connectionManager = createConnectionManager$({
    scope: this.scope,
    connectionFactory: this.connectionFactory,
    inputTransports$: this.allTransports$,
  });

  // ------------------------------------------------------------------------

  private matrixLivekitMembers$ = createMatrixLivekitMembers$({
    scope: this.scope,
    membershipsWithTransport$:
      this.membershipsAndTransports.membershipsWithTransport$,
    connectionManager: this.connectionManager,
    matrixRoom: this.matrixRoom,
  });

  private connectOptions$ = this.scope.behavior(
    matrixRTCMode.value$.pipe(
      map((mode) => ({
        encryptMedia: this.e2eeLivekitOptions !== undefined,
        // TODO. This might need to get called again on each cahnge of matrixRTCMode...
        matrixRTCMode: mode,
      })),
    ),
  );

  private localMembership = createLocalMembership$({
    scope: this.scope,
    muteStates: this.muteStates,
    mediaDevices: this.mediaDevices,
    connectionManager: this.connectionManager,
    matrixRTCSession: this.matrixRTCSession,
    matrixRoom: this.matrixRoom,
    localTransport$: this.localTransport$,
    e2eeLivekitOptions: this.e2eeLivekitOptions,
    trackProcessorState$: this.trackProcessorState$,
    widget,
    options: this.connectOptions$,
  });

  // ------------------------------------------------------------------------
  // CallNotificationLifecycle
  // consider inlining these!!!
  private sentCallNotification$ = createSentCallNotification$(
    this.scope,
    this.matrixRTCSession,
  );
  private receivedDecline$ = createReceivedDecline$(this.matrixRoom);

  private callLifecycle = createCallNotificationLifecycle$({
    scope: this.scope,
    memberships$: this.memberships$,
    sentCallNotification$: this.sentCallNotification$,
    receivedDecline$: this.receivedDecline$,
    options: this.options,
    localUser: { userId: this.userId, deviceId: this.deviceId },
  });

  // ------------------------------------------------------------------------
  // ROOM MEMBER tracking TODO
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private roomMembers$ = createRoomMembers$(this.scope, this.matrixRoom);
  /**
   * If there is a configuration error with the call (e.g. misconfigured E2EE).
   * This is a fatal error that prevents the call from being created/joined.
   * Should render a blocking error screen.
   */
  public get configError$(): Behavior<ElementCallError | null> {
    return this.localMembership.configError$;
  }

  public join = this.localMembership.requestConnect;

  // CODESMELL?
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
  // DISCUSS ? lets think why we need joined and how to do it better
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly joined$ = this.localMembership.connected$;

  /**
   * Whether various media/event sources should pretend to be disconnected from
   * all network input, even if their connection still technically works.
   */
  // We do this when the app is in the 'reconnecting' state, because it might be
  // that the LiveKit connection is still functional while the homeserver is
  // down, for example, and we want to avoid making people worry that the app is
  // in a split-brained state.
  // DISCUSSION own membership manager ALSO this probably can be simplifis
  public reconnecting$ = this.localMembership.reconnecting$;
  private readonly pretendToBeDisconnected$ = this.reconnecting$;

  public readonly audioParticipants$ = this.scope.behavior(
    this.matrixLivekitMembers$.pipe(
      map((members) =>
        members.value.reduce<AudioLivekitItem[]>((acc, curr) => {
          const url = curr.connection?.transport.livekit_service_url;
          const livekitRoom = curr.connection?.livekitRoom;
          const participant = curr.participant?.identity;

          if (!url || !livekitRoom || !participant) return acc;

          const existing = acc.find((item) => item.url === url);
          if (existing) {
            existing.participants.push(participant);
          } else {
            acc.push({ livekitRoom, participants: [participant], url });
          }
          return acc;
        }, []),
      ),
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
  // TODO KEEP THIS!! and adapt it to what our membershipManger returns
  // TODO this also needs the local participant to be added.
  private readonly mediaItems$ = this.scope.behavior<MediaItem[]>(
    generateKeyed$<
      [typeof this.matrixLivekitMembers$.value, number],
      MediaItem,
      MediaItem[]
    >(
      // Generate a collection of MediaItems from the list of expected (whether
      // present or missing) LiveKit participants.
      combineLatest([this.matrixLivekitMembers$, duplicateTiles.value$]),
      ([{ value: matrixLivekitMembers }, duplicateTiles], createOrGet) => {
        const items: MediaItem[] = [];

        for (const {
          connection,
          participant,
          member,
          displayName,
          participantId,
        } of matrixLivekitMembers) {
          if (connection === undefined) {
            logger.warn("connection is not yet initialised.");
            continue;
          }
          for (let i = 0; i < 1 + duplicateTiles; i++) {
            const mediaId = `${participantId}:${i}`;
            const lkRoom = connection?.livekitRoom;
            const url = connection?.transport.livekit_service_url;

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
                  lkRoom,
                  url,
                  this.mediaDevices,
                  this.pretendToBeDisconnected$,
                  constant(displayName ?? "[👻]"),
                  this.handsRaised$.pipe(
                    map((v) => v[participantId]?.time ?? null),
                  ),
                  this.reactions$.pipe(
                    map((v) => v[participantId] ?? undefined),
                  ),
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
                      lkRoom,
                      url,
                      this.pretendToBeDisconnected$,
                      constant(displayName ?? "[👻]"),
                    ),
                ),
              );
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
    [],
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
  // TODO KEEP THIS!! and adapt it to what our membershipManger returns
  public readonly participantCount$ = this.scope.behavior(
    this.memberships$.pipe(map((ms) => ms.value.length)),
  );

  // only public to expose to the view.
  public readonly callPickupState$ = this.callLifecycle.callPickupState$;

  public readonly leaveSoundEffect$ = combineLatest([
    this.callLifecycle.callPickupState$,
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
    this.callLifecycle.autoLeave$,
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
      // TODO This also needs epoch logic to dedupe the screenshares and mediaItems emits
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
    "normal",
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
      "grid",
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
  // DISCUSSION move this into a reaction file
  // const {visibleReactions$, audibleReactions$} = reactionsObservables$(showReactionSetting$, )
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
  // reassigned here to make it publicly accessible
  public readonly sharingScreen$ = this.localMembership.sharingScreen$;

  /**
   * Callback for toggling screen sharing. If null, screen sharing is not
   * available.
   */
  // reassigned here to make it publicly accessible
  public readonly toggleScreenSharing =
    this.localMembership.toggleScreenSharing;

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
    private readonly trackProcessorState$: Behavior<ProcessorState>,
  ) {
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
