/*
Copyright 2025 Element Creations Ltd.
Copyright 2023, 2024, 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type BaseKeyProvider,
  type ConnectionState,
  ExternalE2EEKeyProvider,
  type Room as LivekitRoom,
  type RoomOptions,
} from "livekit-client";
import { type Room as MatrixRoom } from "matrix-js-sdk";
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  distinctUntilChanged,
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
  startWith,
  Subject,
  switchAll,
  switchMap,
  switchScan,
  take,
  tap,
  throttleTime,
  timer,
  takeUntil,
} from "rxjs";
import { type Logger, logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  MembershipManagerEvent,
  type LivekitTransportConfig,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { type IWidgetApiRequest } from "matrix-widget-api";
import { type CallMembershipIdentityParts } from "matrix-js-sdk/lib/matrixrtc/EncryptionManager";
import { v4 as uuidv4 } from "uuid";
import { type IMembershipManager } from "matrix-js-sdk/lib/matrixrtc/IMembershipManager";

import {
  createToggle$,
  filterBehavior,
  generateItem,
  generateItems,
  pauseWhen,
} from "../../utils/observable";
import {
  duplicateTiles,
  playReactionsSound,
  showReactions,
} from "../../settings/settings";
import { Config } from "../../config/Config";
import { MatrixRTCMode } from "../../config/ConfigOptions";
import { isFirefox, platform } from "../../Platform";
import { setPipEnabled$ } from "../../controls";
import { TileStore } from "../TileStore";
import { gridLikeLayout } from "../GridLikeLayout";
import { spotlightExpandedLayout } from "../SpotlightExpandedLayout";
import { oneOnOneLandscapeLayout } from "../OneOnOneLandscapeLayout";
import { oneOnOnePortraitLayout } from "../OneOnOnePortraitLayout";
import { pipLayout } from "../PipLayout";
import { type EncryptionSystem } from "../../e2ee/sharedKeyManagement";
import {
  type RaisedHandInfo,
  type ReactionInfo,
  type ReactionOption,
} from "../../reactions";
import { shallowEquals } from "../../utils/array";
import { type MediaDevices } from "../MediaDevices";
import { constant, type Behavior } from "../Behavior";
import { E2eeType } from "../../e2ee/e2eeType";
import { MatrixKeyProvider } from "../../e2ee/matrixKeyProvider";
import { type MuteStates } from "../MuteStates";
import { getUrlParams, HeaderStyle } from "../../UrlParams";
import { type ProcessorState } from "../../livekit/TrackProcessorContext";
import { ElementWidgetActions, widget } from "../../widget";
import {
  type Alignment,
  type GridLayoutMedia,
  type Layout,
  type LayoutMedia,
  type OneOnOneLandscapeLayoutMedia,
  type OneOnOnePortraitLayoutMedia,
  type SpotlightExpandedLayoutMedia,
  type SpotlightLandscapeLayoutMedia,
  type SpotlightPortraitLayoutMedia,
} from "../layout-types.ts";
import { ElementCallError, UnknownCallError } from "../../utils/errors.ts";
import { type Epoch, type ObservableScope } from "../ObservableScope.ts";
import { createHomeserverConnected$ } from "./localMember/HomeserverConnected.ts";
import {
  createLocalMembership$,
  enterRTCSession,
  TransportState,
} from "./localMember/LocalMember.ts";
import {
  createLocalTransport$,
  JwtEndpointVersion,
  type LocalTransport,
} from "./localMember/LocalTransport.ts";
import {
  createMemberships$,
  membershipsAndTransports$,
} from "../SessionBehaviors.ts";
import {
  type ConnectionFactory,
  ECConnectionFactory,
} from "./remoteMembers/ConnectionFactory.ts";
import {
  type ConnectionManagerData,
  createConnectionManager$,
} from "./remoteMembers/ConnectionManager.ts";
import {
  createRemoteMatrixLivekitMembers$,
  type LocalMatrixLivekitMember,
  type RemoteMatrixLivekitMember,
} from "./remoteMembers/MatrixLivekitMembers.ts";
import {
  type AutoLeaveReason,
  createCallNotificationLifecycle$,
  createReceivedDecline$,
  createSentCallNotification$,
} from "./CallNotificationLifecycle.ts";
import {
  createMatrixMemberMetadata$,
  createRoomMembers$,
} from "./remoteMembers/MatrixMemberMetadata.ts";
import { Publisher } from "./localMember/Publisher.ts";
import { type Connection } from "./remoteMembers/Connection.ts";
import { createLayoutModeSwitch } from "./LayoutSwitch.ts";
import {
  createWrappedUserMedia,
  type WrappedUserMediaViewModel,
} from "../media/WrappedUserMediaViewModel.ts";
import { type ScreenShareViewModel } from "../media/ScreenShareViewModel.ts";
import { type UserMediaViewModel } from "../media/UserMediaViewModel.ts";
import { type MediaViewModel } from "../media/MediaViewModel.ts";
import { type LocalUserMediaViewModel } from "../media/LocalUserMediaViewModel.ts";
import { type RemoteUserMediaViewModel } from "../media/RemoteUserMediaViewModel.ts";
import {
  createRingingMedia,
  type RingingMediaViewModel,
} from "../media/RingingMediaViewModel.ts";
import { type GridTileViewModel } from "../TileViewModel.ts";

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
  /** Optional behavior overriding the computed window size, mainly for testing purposes. */
  windowSize$?: Behavior<{ width: number; height: number }>;
  /** Optional value overriding the local transport, for testing purposes. */
  localTransport?: LocalTransport;
  /** Optional value overriding the connection factory, for testing purposes. */
  connectionFactory?: ConnectionFactory;
  /** The version & compatibility mode of MatrixRTC that we should use. */
  matrixRTCMode$?: Behavior<MatrixRTCMode>;
  /** Optional behavior overriding for the screensharing, for testing */
  toggleScreensharing?: () => void;
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
  overflowing: boolean;
  tiles: TileStore;
}

export type LivekitRoomItem = {
  livekitRoom: LivekitRoom;
  participants: string[];
  url: string;
};

/**
 * The return of createCallViewModel$
 * this interface represents the root source of data for the call view.
 * They are a list of observables and objects containing observables to allow for a very granular update mechanism.
 *
 * This allows to have one huge call view model that represents the entire view without a unnecessary amount of updates.
 *
 * (Mocking this interface should allow building a full view in all states.)
 */
export interface CallViewModel {
  // lifecycle
  autoLeave$: Observable<AutoLeaveReason>;
  /**
   * View model for info relating to ringing, timing out, calling back, etc.
   */
  ringingVm$: Behavior<RingingMediaViewModel | null>;
  /**
   * Which visual element the ringing status should be shown in.
   */
  ringingStatusLocation: "app_bar" | "tile";
  /** Observable that emits when the user should leave the call (hangup pressed, widget action, error).
   * THIS DOES NOT LEAVE THE CALL YET. The only way to leave the call (send the hangup event) is
   *  - by ending the scope
   *  - or calling requestDisconnect
   *
   * TODO: it seems more reasonable to add a leave() method (that calls requestDisconnect) that will then update leave$ and remove the hangup pattern
   */
  leave$: Observable<"user" | AutoLeaveReason>;
  /** Call to initiate hangup. Use in conbination with reconnection state track the async hangup process. */
  hangup: () => void;

  // joining
  join: () => void;

  /**
   * calls requestDisconnect. The async leave state can than be observed via connected$
   */
  leave: () => void;
  // screen sharing
  /**
   * Callback to toggle screen sharing. If null, screen sharing is not possible.
   */
  toggleScreenSharing: (() => void) | null;
  /**
   * Whether we are sharing our screen.
   */
  sharingScreen$: Behavior<boolean>;

  // UI interactions
  /**
   * Callback for when the user taps the call view.
   */
  tapScreen: () => void;
  /**
   * Callback for when the user taps the call's controls.
   */
  tapControls: () => void;
  /**
   * Callback for when the user hovers over the call view.
   */
  hoverScreen: () => void;
  /**
   * Callback for when the user stops hovering over the call view.
   */
  unhoverScreen: () => void;

  // errors
  /**
   * If there is a configuration error with the call (e.g. misconfigured E2EE).
   * This is a fatal error that prevents the call from being created/joined.
   * Should render a blocking error screen.
   */
  fatalError$: Behavior<ElementCallError | null>;

  // participants and counts
  /**
   * The number of participants currently in the call.
   *
   *  - Each participant has a corresponding MatrixRTC membership state event
   *  - There can be multiple participants for one Matrix user if they join from
   *    multiple devices.
   */
  participantCount$: Behavior<number>;
  allConnections$: Behavior<ConnectionManagerData>;
  /** Participants sorted by livekit room so they can be used in the audio rendering */
  livekitRoomItems$: Behavior<LivekitRoomItem[]>;
  /** use the layout instead, this is just for the sdk export. */
  remoteMatrixLivekitMembers$: Behavior<RemoteMatrixLivekitMember[]>;
  localMatrixLivekitMember$: Behavior<LocalMatrixLivekitMember | null>;
  /** List of participants raising their hand */
  handsRaised$: Behavior<Record<string, RaisedHandInfo>>;
  /** List of reactions. Keys are: membership.membershipId (currently predefined as: `${membershipEvent.userId}:${membershipEvent.deviceId}`)*/
  reactions$: Behavior<Record<string, ReactionOption>>;

  // sounds and events
  joinSoundEffect$: Observable<void>;
  leaveSoundEffect$: Observable<void>;
  /**
   * Emits an event every time a new hand is raised in
   * the call.
   */
  newHandRaised$: Observable<{ value: number; playSounds: boolean }>;
  /**
   * Emits an event every time a new screenshare is started in
   * the call.
   */
  newScreenShare$: Observable<{ value: number; playSounds: boolean }>;
  /**
   * Emits an array of reactions that should be played.
   */
  audibleReactions$: Observable<string[]>;
  /**
   * Emits an array of reactions that should be visible on the screen.
   */
  // DISCUSSION move this into a reaction file
  visibleReactions$: Behavior<
    { sender: string; emoji: string; startX: number }[]
  >;

  /**
   * The layout of tiles in the call interface.
   */
  layout$: Behavior<Layout>;
  /**
   * The current generation of the tile store, exposed for debugging purposes.
   */
  tileStoreGeneration$: Behavior<number>;
  showSpotlightIndicators$: Behavior<boolean>;
  showSpeakingIndicators$: Behavior<boolean>;
  showNameTags$: Behavior<boolean>;
  spotlightExpanded$: Behavior<boolean>;
  toggleSpotlightExpanded$: Behavior<(() => void) | null>;
  gridMode$: Behavior<GridMode>;
  setGridMode: (value: GridMode) => void;

  // header/footer visibility
  showHeader$: Behavior<boolean>;
  showFooter$: Behavior<boolean>;
  /**
   * Whether the call layout should be displayed edge-to-edge, with the footer
   * and header as overlays.
   */
  edgeToEdge$: Behavior<boolean>;
  /**
   * Whether the call layout is overflowing the interface (causing it to scroll).
   */
  overflowing$: Behavior<boolean>;

  settingsOpen$: Behavior<boolean>;
  setSettingsOpen$: Behavior<(open: boolean) => void>;

  // audio routing
  /**
   * Whether audio is currently being output through the earpiece.
   */
  earpieceMode$: Behavior<boolean>;
  /**
   * Callback to toggle between the earpiece and the loudspeaker.
   *
   * This will be `null` in case the target does not exist in the list
   * of available audio outputs.
   */
  audioOutputSwitcher$: Behavior<{
    targetOutput: "earpiece" | "speaker";
    switch: () => void;
  } | null>;

  /**
   * Whether the app is currently reconnecting to the LiveKit server and/or setting the matrix rtc room state.
   */
  reconnecting$: Behavior<boolean>;

  /**
   * Shortcut for not requireing to parse and combine connectionState.matrix and connectionState.livekit
   */
  connected$: Behavior<boolean>;
}

/**
 * A view model providing all the application logic needed to show the in-call
 * UI (may eventually be expanded to cover the lobby and feedback screens in the
 * future).
 */
// Throughout this class and related code we must distinguish between MatrixRTC
// state and LiveKit state. We use the common terminology of room "members", RTC
// "memberships", and LiveKit "participants".
export function createCallViewModel$(
  scope: ObservableScope,
  // A call is permanently tied to a single Matrix room
  matrixRTCSession: MatrixRTCSession,
  matrixRoom: MatrixRoom,
  mediaDevices: MediaDevices,
  muteStates: MuteStates,
  options: CallViewModelOptions,
  handsRaisedSubject$: Observable<Record<string, RaisedHandInfo>>,
  reactionsSubject$: Observable<Record<string, ReactionInfo>>,
  trackProcessorState$: Behavior<ProcessorState>,
): CallViewModel {
  const logger = rootLogger.getChild("[CallViewModel]");
  const client = matrixRoom.client;
  const userId = client.getUserId();
  const deviceId = client.getDeviceId();
  if (!(userId && deviceId))
    throw new UnknownCallError(new Error("userId and deviceId are required"));

  const livekitKeyProvider = getE2eeKeyProvider(
    options.encryptionSystem,
    matrixRTCSession,
    logger,
  );
  // matrix_rtc_mode in config.json overrides the user's Developer Settings choice.
  // It is validated at config load (src/config/Config.ts) so the cast is safe.
  const configMatrixRTCMode = Config.get().matrix_rtc_mode as
    | MatrixRTCMode
    | undefined;
  const matrixRTCMode$ =
    configMatrixRTCMode !== undefined
      ? constant(configMatrixRTCMode)
      : (options.matrixRTCMode$ ?? constant(MatrixRTCMode.Legacy));

  // Each hbar seperates a block of input variables required for the CallViewModel to function.
  // The outputs of this block is written under the hbar.
  //
  // For mocking purposes it is recommended to only mock the functions creating those outputs.
  // All other fields are just temp computations for the mentioned output.
  // The class does not need anything except the values underneath the bar.
  // The creations of the values under the bar are all tested independently and testing the callViewModel Should
  // not test their creation. Call view model only needs:
  //  - memberships$ via createMemberships$
  //  - localMembership via createLocalMembership$
  //  - callLifecycle via createCallNotificationLifecycle$
  //  - matrixMemberMetadataStore via createMatrixMemberMetadata$

  // ------------------------------------------------------------------------
  // memberships$
  const memberships$ = createMemberships$(scope, matrixRTCSession);

  // ------------------------------------------------------------------------
  // matrixLivekitMembers$ AND localMembership

  const membershipsAndTransports = membershipsAndTransports$(
    scope,
    memberships$,
  );

  const ownMembershipIdentity: CallMembershipIdentityParts = {
    userId,
    deviceId,
    // This will only be consumed by the sticky membership manager. So it has no impact on legacy calls.
    memberId: uuidv4(),
  };

  const localTransport$ = scope.behavior(
    matrixRTCMode$.pipe(
      generateItem(
        "CallViewModel localTransport$",
        // Re-create LocalTransport whenever the mode changes
        (mode) => ({ keys: [mode], data: undefined }),
        (scope, _data$, mode) =>
          options.localTransport ??
          createLocalTransport$({
            scope: scope,
            memberships$: memberships$,
            ownMembershipIdentity,
            client,
            delayId$: scope.behavior(
              (
                fromEvent(
                  matrixRTCSession,
                  MembershipManagerEvent.DelayIdChanged,
                  // The type of reemitted event includes the original emitted as the second arg.
                ) as Observable<[string | undefined, IMembershipManager]>
              ).pipe(map(([delayId]) => delayId ?? null)),
              matrixRTCSession.delayId ?? null,
            ),
            roomId: matrixRoom.roomId,
            forceJwtEndpoint:
              mode === MatrixRTCMode.Matrix_2_0
                ? JwtEndpointVersion.Matrix_2_0
                : JwtEndpointVersion.Legacy,
            useOldestMember: mode === MatrixRTCMode.Legacy,
          }),
      ),
    ),
  );

  const connectionFactory =
    options.connectionFactory ??
    new ECConnectionFactory(
      client,
      matrixRoom.roomId,
      mediaDevices,
      trackProcessorState$,
      livekitKeyProvider,
      getUrlParams().controlledAudioDevices,
      options.livekitRoomFactory,
      getUrlParams().echoCancellation,
      getUrlParams().noiseSuppression,
    );

  const connectionManager = createConnectionManager$({
    scope: scope,
    connectionFactory: connectionFactory,
    localTransport$: scope.behavior(
      localTransport$.pipe(
        switchMap((t) => t.active$),
        catchError((e: unknown) => {
          logger.info(
            "could not pass local transport to createConnectionManager$. localTransport$ threw an error",
            e,
          );
          return of(null);
        }),
      ),
    ),
    remoteTransports$: membershipsAndTransports.transports$,
    logger: logger,
    ownMembershipIdentity,
  });

  const remoteMatrixLivekitMembers$: Behavior<
    Epoch<RemoteMatrixLivekitMember[]>
  > = createRemoteMatrixLivekitMembers$({
    scope: scope,
    membershipsWithTransport$:
      membershipsAndTransports.membershipsWithTransport$,
    connectionManager: connectionManager,
    localUser: { userId, deviceId },
  });

  const connectOptions$ = scope.behavior(
    matrixRTCMode$.pipe(
      map((mode) => ({
        encryptMedia: livekitKeyProvider !== undefined,
        // TODO. This might need to get called again on each change of matrixRTCMode...
        matrixRTCMode: mode,
      })),
    ),
  );

  const localMembership = createLocalMembership$({
    scope,
    homeserverConnected: createHomeserverConnected$(
      scope,
      client,
      matrixRTCSession,
    ),
    muteStates,
    joinMatrixRTC: (transport: LivekitTransportConfig) => {
      return enterRTCSession(
        matrixRTCSession,
        ownMembershipIdentity,
        transport,
        connectOptions$.value,
      );
    },
    createPublisherFactory: (connection: Connection) => {
      return new Publisher(
        connection,
        mediaDevices,
        muteStates,
        trackProcessorState$,
        logger.getChild(
          "[Publisher " + connection.transport.livekit_service_url + "]",
        ),
      );
    },
    connectionManager,
    matrixRTCSession,
    localTransport$,
    roomId: matrixRoom.roomId,
    logger: logger.getChild(`[${Date.now()}]`),
  });

  const localRtcMembership$ = scope.behavior(
    memberships$.pipe(
      map(
        (memberships) =>
          memberships.value.find(
            (membership) =>
              membership.userId === userId && membership.deviceId === deviceId,
          ) ?? null,
      ),
    ),
  );

  const localMatrixLivekitMember$: Behavior<LocalMatrixLivekitMember | null> =
    scope.behavior(
      localRtcMembership$.pipe(
        filterBehavior((membership) => membership !== null),
        map((membership$) => {
          if (membership$ === null) return null;
          return {
            membership$,
            participant: {
              type: "local" as const,
              value$: localMembership.participant$,
            },
            connection$: localMembership.connection$,
            userId,
          };
        }),
      ),
    );

  const matrixLivekitMembers$ = scope.behavior(
    combineLatest(
      [localMatrixLivekitMember$, remoteMatrixLivekitMembers$],
      (local, remote) => [...(local === null ? [] : [local]), ...remote.value],
    ),
  );

  // ------------------------------------------------------------------------
  // matrixMemberMetadataStore

  const matrixRoomMembers$ = createRoomMembers$(scope, matrixRoom);
  const matrixMemberMetadataStore = createMatrixMemberMetadata$(
    scope,
    scope.behavior(memberships$.pipe(map((mems) => mems.value))),
    matrixRoomMembers$,
  );

  // ------------------------------------------------------------------------
  // callLifecycle

  // TODO if we are in "unknown" state we need a loading rendering (or empty screen)
  // Otherwise it looks like we already connected and only than the ringing starts which is weird.
  const { ringAttempts$, autoLeave$ } = createCallNotificationLifecycle$({
    scope,
    memberships$,
    matrixRoomMembers$,
    sentCallNotification$: createSentCallNotification$(scope, matrixRTCSession),
    receivedDecline$: createReceivedDecline$(matrixRoom),
    options,
    localUser: { userId, deviceId },
  });

  const allConnections$ = scope.behavior(
    connectionManager.connectionManagerData$.pipe(map((d) => d.value)),
  );
  const livekitRoomItems$ = scope.behavior(
    remoteMatrixLivekitMembers$.pipe(
      switchMap((members) => {
        const a$ = combineLatest(
          members.value.map((member) =>
            combineLatest([member.connection$, member.participant.value$]).pipe(
              map(([connection, participant]) => {
                // do not render audio for local participant
                if (!connection || !participant || participant.isLocal)
                  return null;
                const livekitRoom = connection.livekitRoom;
                const url = connection.transport.livekit_service_url;

                return {
                  url,
                  livekitRoom,
                  participant: participant.identity,
                };
              }),
            ),
          ),
        );
        return a$;
      }),
      map((members) =>
        members.reduce<LivekitRoomItem[]>((acc, curr) => {
          if (!curr) return acc;

          const existing = acc.find((item) => item.url === curr.url);
          if (existing) {
            existing.participants.push(curr.participant);
          } else {
            acc.push({
              livekitRoom: curr.livekitRoom,
              participants: [curr.participant],
              url: curr.url,
            });
          }
          return acc;
        }, []),
      ),
    ),
    [],
  );

  const handsRaised$ = scope.behavior(
    handsRaisedSubject$.pipe(pauseWhen(localMembership.reconnecting$)),
  );

  const reactions$ = scope.behavior(
    reactionsSubject$.pipe(
      map((v) =>
        Object.fromEntries(
          Object.entries(v).map(([a, { reactionOption }]) => [
            a,
            reactionOption,
          ]),
        ),
      ),
      pauseWhen(localMembership.reconnecting$),
    ),
  );

  /**
   * List of user media (camera feeds) that we want tiles for.
   */
  const userMedia$ = scope.behavior<WrappedUserMediaViewModel[]>(
    combineLatest([matrixLivekitMembers$, duplicateTiles.value$]).pipe(
      // Generate a collection of user media from the list of expected (whether
      // present or missing) LiveKit participants.
      generateItems(
        "CallViewModel userMedia$",
        function* ([members, duplicateTiles]) {
          for (const {
            userId,
            participant,
            connection$,
            membership$,
          } of members) {
            const rtcId = membership$.value.rtcBackendIdentity;
            const mediaId = `${userId}:${membership$.value.deviceId}`;
            for (let dup = 0; dup < 1 + duplicateTiles; dup++) {
              yield {
                keys: [dup, mediaId, userId, participant, connection$, rtcId],
                data: undefined,
              };
            }
          }
        },
        (scope, _, dup, mediaId, userId, participant, connection$, rtcId) =>
          createWrappedUserMedia(scope, {
            id: `${mediaId}:${dup}`,
            userId,
            rtcBackendIdentity: rtcId,
            participant,
            encryptionSystem: options.encryptionSystem,
            livekitRoom$: scope.behavior(
              connection$.pipe(map((c) => c?.livekitRoom)),
            ),
            focusUrl$: scope.behavior(
              connection$.pipe(map((c) => c?.transport.livekit_service_url)),
            ),
            mediaDevices,
            pretendToBeDisconnected$: localMembership.reconnecting$,
            displayName$: scope.behavior(
              matrixMemberMetadataStore
                .createDisplayNameBehavior$(scope, userId)
                .pipe(map((name) => name ?? userId)),
            ),
            mxcAvatarUrl$: matrixMemberMetadataStore.createAvatarUrlBehavior$(
              scope,
              userId,
            ),
            handRaised$: scope.behavior(
              handsRaised$.pipe(map((v) => v[mediaId]?.time ?? null)),
            ),
            reaction$: scope.behavior(
              reactions$.pipe(map((v) => v[mediaId] ?? undefined)),
            ),
          }),
      ),
    ),
  );

  const ringingMedia$ = scope.behavior<RingingMediaViewModel | null>(
    ringAttempts$.pipe(
      switchMap(({ intent, recipient, outcome$ }) =>
        outcome$.pipe(
          startWith("ringing" as const),
          generateItems(
            "CallViewModel ringingMedia$",
            function* (pickupState) {
              if (pickupState !== "accept")
                yield { keys: [intent, recipient], data: pickupState };
            },
            (scope, pickupState$, intent, userId) =>
              createRingingMedia({
                id: `ringing:${userId}`,
                userId,
                displayName$: scope.behavior(
                  matrixRoomMembers$.pipe(
                    map(
                      (members) =>
                        members.get(userId)?.rawDisplayName || userId,
                    ),
                  ),
                ),
                mxcAvatarUrl$:
                  matrixMemberMetadataStore.createAvatarUrlBehavior$(
                    scope,
                    userId,
                  ),
                pickupState$,
                intent,
              }),
          ),
          map(([media]) => media ?? null),
        ),
      ),
      startWith(null),
    ),
  );

  /**
   * All screen share media that we want to display.
   */
  const screenShares$ = scope.behavior<ScreenShareViewModel[]>(
    userMedia$.pipe(
      switchMap((userMedia) =>
        userMedia.length === 0
          ? of([])
          : combineLatest(
              userMedia.map((m) => m.screenShares$),
              (...screenShares) => screenShares.flat(1),
            ),
      ),
    ),
  );

  const joinSoundEffect$ = userMedia$.pipe(
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
  const participantCount$ = scope.behavior(
    matrixLivekitMembers$.pipe(map((ms) => ms.length)),
  );

  const leaveSoundEffect$ = userMedia$.pipe(
    pairwise(),
    filter(
      ([prev, current]) =>
        current.length <= MAX_PARTICIPANT_COUNT_FOR_SOUND &&
        current.length < prev.length,
    ),
    map(() => {}),
    throttleTime(THROTTLE_SOUND_EFFECT_MS),
    // Avoid doubling up on any auto-leave sounds (e.g. the decline sound),
    // which are handled elsewhere
    takeUntil(autoLeave$),
  );

  const userHangup$ = new Subject<void>();

  const widgetHangup$ =
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

  const leave$: Observable<"user" | "timeout" | "decline" | "allOthersLeft"> =
    merge(
      autoLeave$,
      merge(userHangup$, widgetHangup$).pipe(map(() => "user" as const)),
    ).pipe(scope.share);

  const spotlightSpeaker$ = scope.behavior<UserMediaViewModel | undefined>(
    userMedia$.pipe(
      switchMap((mediaItems) =>
        mediaItems.length === 0
          ? of([])
          : combineLatest(
              mediaItems.map((m) =>
                m.speaking$.pipe(map((s) => [m, s] as const)),
              ),
            ),
      ),
      scan<
        (readonly [UserMediaViewModel, boolean])[],
        UserMediaViewModel | undefined,
        undefined
      >((prev, mediaItems) => {
        // Only remote users that are still in the call should be sticky
        const [stickyMedia, stickySpeaking] =
          (!prev?.local && mediaItems.find(([m]) => m === prev)) || [];
        // Decide who to spotlight:
        // If the previous speaker is still speaking, stick with them rather
        // than switching eagerly to someone else
        return stickySpeaking
          ? stickyMedia!
          : // Otherwise, select any remote user who is speaking
            (mediaItems.find(([m, s]) => !m.local && s)?.[0] ??
              // Otherwise, stick with the person who was last speaking
              stickyMedia ??
              // Otherwise, spotlight an arbitrary remote user
              mediaItems.find(([m]) => !m.local)?.[0] ??
              // Otherwise, spotlight the local user
              mediaItems.find(([m]) => m.local)?.[0]);
      }, undefined),
    ),
  );

  const grid$ = scope.behavior<UserMediaViewModel[]>(
    userMedia$.pipe(
      switchMap((mediaItems) => {
        const bins = mediaItems.map((m) =>
          m.bin$.pipe(map((bin) => [m, bin] as const)),
        );
        // Sort the media by bin order and generate a tile for each one
        return bins.length === 0
          ? of([])
          : combineLatest(bins, (...bins) =>
              bins.sort(([, bin1], [, bin2]) => bin1 - bin2).map(([m]) => m),
            );
      }),
      distinctUntilChanged(shallowEquals),
    ),
  );

  /**
   * Local user media suitable for displaying in a PiP (undefined if not found,
   * video is muted, or if user prefers to not see themselves).
   */
  const localUserMediaForPip$ = scope.behavior<
    LocalUserMediaViewModel | undefined
  >(
    userMedia$.pipe(
      switchMap((userMedia) => {
        const localUserMedia = userMedia.find(
          (m): m is WrappedUserMediaViewModel & LocalUserMediaViewModel =>
            m.type === "user" && m.local,
        );
        if (!localUserMedia) return of(undefined);
        return combineLatest(
          [localUserMedia.videoEnabled$, localUserMedia.alwaysShow$],
          (videoEnabled, alwaysShow) =>
            videoEnabled && alwaysShow ? localUserMedia : undefined,
        );
      }),
    ),
  );

  const spotlightAndPip$ = scope.behavior<{
    spotlight: MediaViewModel[];
    pip$: Observable<UserMediaViewModel | undefined>;
  }>(
    ringingMedia$.pipe(
      switchMap((ringingMedia) => {
        if (ringingMedia !== null)
          return of({ spotlight: [ringingMedia], pip$: localUserMediaForPip$ });

        return screenShares$.pipe(
          switchMap((screenShares) => {
            if (screenShares.length > 0)
              return of({ spotlight: screenShares, pip$: spotlightSpeaker$ });

            return spotlightSpeaker$.pipe(
              map((speaker) => ({
                spotlight: speaker ? [speaker] : [],
                // Hide PiP if redundant (i.e. if local user is already in spotlight)
                pip$: localUserMediaForPip$.pipe(
                  map((m) => (m === speaker ? undefined : m)),
                ),
              })),
            );
          }),
        );
      }),
    ),
  );

  const spotlight$ = scope.behavior<MediaViewModel[]>(
    spotlightAndPip$.pipe(
      map(({ spotlight }) => spotlight),
      distinctUntilChanged<MediaViewModel[]>(shallowEquals),
    ),
  );

  const hasRemoteScreenShares$ = scope.behavior<boolean>(
    spotlight$.pipe(
      map((spotlight) =>
        spotlight.some((vm) => vm.type === "screen share" && !vm.local),
      ),
    ),
  );

  const pipEnabled$ = scope.behavior(setPipEnabled$, false);

  const windowSize$ =
    options.windowSize$ ??
    scope.behavior<{ width: number; height: number }>(
      fromEvent(window, "resize").pipe(
        startWith(null),
        map(() => ({ width: window.innerWidth, height: window.innerHeight })),
      ),
    );

  // A guess at what the window's mode should be based on its size and shape.
  const naturalWindowMode$ = scope.behavior<WindowMode>(
    windowSize$.pipe(
      map(({ width, height }) => {
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
  const windowMode$ = scope.behavior<WindowMode>(
    pipEnabled$.pipe(
      switchMap((pip) => (pip ? of<WindowMode>("pip") : naturalWindowMode$)),
    ),
  );

  const spotlightExpandedToggle$ = new Subject<void>();
  const spotlightExpanded$ = createToggle$(
    scope,
    false,
    spotlightExpandedToggle$,
  );

  const { setGridMode, gridMode$ } = createLayoutModeSwitch(
    scope,
    windowMode$,
    hasRemoteScreenShares$,
  );

  const gridLayoutMedia$: Observable<GridLayoutMedia> = combineLatest(
    [grid$, spotlight$],
    (grid, spotlight) => ({
      type: "grid",
      edgeToEdge: false,
      spotlight: spotlight.some((vm) => vm.type === "screen share")
        ? spotlight
        : undefined,
      grid,
    }),
  );

  const spotlightLandscapeLayoutMedia$ = (
    edgeToEdge: boolean,
  ): Observable<SpotlightLandscapeLayoutMedia> =>
    combineLatest([grid$, spotlight$], (grid, spotlight) => ({
      type: "spotlight-landscape",
      edgeToEdge,
      spotlight,
      grid,
    }));

  const spotlightPortraitLayoutMedia$: Observable<SpotlightPortraitLayoutMedia> =
    combineLatest([grid$, spotlight$], (grid, spotlight) => ({
      type: "spotlight-portrait",
      edgeToEdge: false,
      spotlight,
      grid,
    }));

  const spotlightExpandedLayoutMedia$ = (
    edgeToEdge: boolean,
  ): Observable<SpotlightExpandedLayoutMedia> =>
    spotlightAndPip$.pipe(
      switchMap(({ spotlight, pip$ }) =>
        pip$.pipe(
          map((pip) => ({
            type: "spotlight-expanded" as const,
            edgeToEdge,
            spotlight,
            pip: pip ?? undefined,
          })),
        ),
      ),
    );

  const oneOnOneLayoutMedia$: Observable<{
    local: LocalUserMediaViewModel;
    remote: UserMediaViewModel | RingingMediaViewModel;
  } | null> = combineLatest([userMedia$, screenShares$]).pipe(
    switchMap(([userMedia, screenShares]) => {
      // One-on-one layout only supports 2 user media, no screen shares
      if (userMedia.length <= 2 && screenShares.length === 0) {
        const local = userMedia.find(
          (vm): vm is WrappedUserMediaViewModel & LocalUserMediaViewModel =>
            vm.type === "user" && vm.local,
        );

        if (local !== undefined) {
          const remote = userMedia.find(
            (vm): vm is WrappedUserMediaViewModel & RemoteUserMediaViewModel =>
              vm.type === "user" && !vm.local,
          );

          if (remote !== undefined) return of({ local, remote });

          // If there's no other user media in the call (could still happen in
          // this branch due to the duplicate tiles option), we could possibly
          // show ringing media instead
          if (userMedia.length === 1)
            return ringingMedia$.pipe(
              map(
                (ringingMedia) =>
                  ringingMedia && { local, remote: ringingMedia },
              ),
            );
        }
      }

      return of(null);
    }),
  );

  const oneOnOneLandscapeLayoutMedia$: Observable<OneOnOneLandscapeLayoutMedia | null> =
    oneOnOneLayoutMedia$.pipe(
      map((media) => {
        if (media === null) return null;
        return media.remote.type === "ringing"
          ? {
              type: "one-on-one-landscape" as const,
              edgeToEdge: false,
              spotlight: media.local,
              pip: media.remote,
            }
          : {
              type: "one-on-one-landscape" as const,
              edgeToEdge: false,
              spotlight: media.remote,
              pip: media.local,
            };
      }),
    );

  const oneOnOnePortraitLayoutMedia$: Observable<OneOnOnePortraitLayoutMedia | null> =
    oneOnOneLayoutMedia$.pipe(
      switchMap((media) => {
        if (media === null) return of(null);
        return media.local.videoEnabled$.pipe(
          map((videoEnabled) => ({
            type: "one-on-one-portrait" as const,
            edgeToEdge: true as const,
            spotlight: media.remote,
            pip: videoEnabled ? media.local : undefined,
          })),
        );
      }),
    );

  const pipLayoutMedia$: Observable<LayoutMedia> = spotlight$.pipe(
    map((spotlight) => ({
      type: "pip",
      edgeToEdge: platform !== "desktop",
      spotlight,
    })),
  );

  spotlight$
    .pipe(
      switchMap((media) => {
        let layout;
        const pipMedia = media[0];
        if (pipMedia === undefined) return of(undefined);
        switch (pipMedia.type) {
          case "user":
            layout = pipMedia.videoOrientation$;
            break;
          case "ringing":
            layout = of("landscape" as const);
            break;
          case "screen share":
            layout = of("landscape" as const);
            break;
        }
        return layout;
      }),
      scope.bind(),
    )
    .subscribe((orientation) => {
      if (orientation === undefined) return;
      logger.info("controls api pip orientation updated:", orientation);
      window.controls.onPipMediaOrientationUpdate?.(orientation);
    });

  /**
   * The media to be used to produce a layout.
   */
  const layoutMedia$ = scope.behavior<LayoutMedia>(
    windowMode$.pipe(
      switchMap((windowMode) => {
        switch (windowMode) {
          case "normal":
            return gridMode$.pipe(
              switchMap((gridMode) => {
                switch (gridMode) {
                  case "grid":
                    return oneOnOneLandscapeLayoutMedia$.pipe(
                      switchMap((oneOnOne) =>
                        oneOnOne === null ? gridLayoutMedia$ : of(oneOnOne),
                      ),
                    );
                  case "spotlight":
                    return spotlightExpanded$.pipe(
                      switchMap((expanded) =>
                        expanded
                          ? spotlightExpandedLayoutMedia$(false)
                          : spotlightLandscapeLayoutMedia$(false),
                      ),
                    );
                }
              }),
            );
          case "narrow":
            return oneOnOnePortraitLayoutMedia$.pipe(
              switchMap((oneOnOne) =>
                oneOnOne === null
                  ? combineLatest([grid$, spotlight$], (grid, spotlight) =>
                      grid.length > smallMobileCallThreshold ||
                      spotlight.some((vm) => vm.type === "screen share")
                        ? spotlightPortraitLayoutMedia$
                        : gridLayoutMedia$,
                    ).pipe(switchAll())
                  : of(oneOnOne),
              ),
            );
          case "flat":
            return gridMode$.pipe(
              switchMap((gridMode) => {
                switch (gridMode) {
                  case "grid":
                    // Yes, grid mode actually gets you a "spotlight" layout in
                    // this window mode.
                    return spotlightLandscapeLayoutMedia$(true);
                  case "spotlight":
                    return spotlightExpandedLayoutMedia$(true);
                }
              }),
            );
          case "pip":
            return pipLayoutMedia$;
        }
      }),
    ),
  );

  const showSpotlightIndicators$ = scope.behavior<boolean>(
    layoutMedia$.pipe(map((l) => l.type !== "grid")),
  );

  const showSpeakingIndicators$ = scope.behavior<boolean>(
    layoutMedia$.pipe(
      map((l) => {
        switch (l.type) {
          case "spotlight-landscape":
          case "spotlight-portrait":
            // If the spotlight is showing the active speaker, we can do without
            // speaking indicators as they're a redundant visual cue. But if
            // screen sharing feeds are in the spotlight we still need them.
            return l.spotlight.some((m) => m.type === "screen share");
          // In expanded spotlight layout, the active speaker is always shown in
          // the picture-in-picture tile so there is no need for speaking
          // indicators. And in one-on-one layout there's no question as to who is
          // speaking.
          case "spotlight-expanded":
          case "one-on-one-landscape":
          case "one-on-one-portrait":
            return false;
          default:
            return true;
        }
      }),
    ),
  );

  const showNameTags$ = scope.behavior<boolean>(
    layoutMedia$.pipe(
      switchMap((l) =>
        l.type === "pip" || l.type === "one-on-one-portrait"
          ? matrixRoomMembers$.pipe(
              map(
                (members) =>
                  // Hide name tags by default in these layouts. For safety we
                  // still need to show them in case it wouldn't be clear who
                  // the spotlight media belongs to.
                  // TODO: Respect io.element.functional_members (while still
                  // being careful to never show a functional member's media
                  // without a name tag!)
                  // TODO: Only hide name tags in DMs, not group chats that just
                  // happen to have only 2 users
                  members.size > 2,
              ),
            )
          : of(true),
      ),
    ),
  );

  const toggleSpotlightExpanded$ = scope.behavior<(() => void) | null>(
    windowMode$.pipe(
      switchMap((mode) =>
        mode === "normal"
          ? layoutMedia$.pipe(
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
        enabled ? (): void => spotlightExpandedToggle$.next() : null,
      ),
    ),
  );

  const edgeToEdge$ = scope.behavior<boolean>(
    layoutMedia$.pipe(map(({ edgeToEdge }) => edgeToEdge)),
  );

  const screenTap$ = new Subject<void>();
  const controlsTap$ = new Subject<void>();
  const screenHover$ = new Subject<void>();
  const screenUnhover$ = new Subject<void>();

  const naturallyShowFooter$ = scope.behavior<boolean>(
    edgeToEdge$.pipe(
      switchMap((edgeToEdge) => {
        if (!edgeToEdge) return of(true);

        // Sadly Firefox has some layering glitches that prevent the footer
        // from appearing properly. They happen less often if we never hide
        // the footer.
        if (isFirefox()) return of(true);

        // Layout is edge-to-edge; show/hide the footer in response to interactions
        return windowMode$.pipe(
          switchMap((mode) => {
            if (mode === "pip" && platform !== "desktop") {
              // No controls are shown in mobile pip as interactions are disabled
              return of(false);
            }
            const showInitially = mode !== "flat";
            const timeout$ = mode === "flat" ? timer(showFooterMs) : NEVER;

            return merge(
              screenTap$.pipe(map(() => "tap screen" as const)),
              controlsTap$.pipe(map(() => "tap controls" as const)),
              screenHover$.pipe(map(() => "hover" as const)),
            ).pipe(
              switchScan((state, interaction) => {
                switch (interaction) {
                  case "tap screen":
                    return state
                      ? // Toggle visibility on tap
                        of(false)
                      : // Hide after a timeout
                        timeout$.pipe(
                          map(() => false),
                          startWith(true),
                        );
                  case "tap controls":
                    // The user is interacting with things, so reset the timeout
                    return timeout$.pipe(
                      map(() => false),
                      startWith(true),
                    );
                  case "hover":
                    // Show on hover and hide after a timeout
                    return race(timeout$, screenUnhover$.pipe(take(1))).pipe(
                      map(() => false),
                      startWith(true),
                    );
                }
              }, showInitially),
              startWith(showInitially),
            );
          }),
        );
      }),
    ),
  );

  const urlParams = getUrlParams();
  const showFooterUrlParams = !(
    urlParams.header === HeaderStyle.None && urlParams.showControls === false
  );
  const showFooter$ = scope.behavior(
    naturallyShowFooter$.pipe(
      map((naturallyShowFooter) => naturallyShowFooter && showFooterUrlParams),
    ),
  );
  const settingsOpen$ = new BehaviorSubject(false);
  const setSettingsOpen$ = constant((open: boolean) => {
    settingsOpen$.next(open);
  });

  const showHeader$ = scope.behavior<boolean>(
    windowMode$.pipe(
      switchMap((mode) => {
        // In small windows the header would be too obstructive
        if (mode === "pip") return of(false);
        // In edge-to-edge layouts, couple the visibility of the header
        // to that of the footer
        return edgeToEdge$.pipe(
          switchMap((edgeToEdge) => (edgeToEdge ? showFooter$ : of(true))),
        );
      }),
    ),
  );

  /**
   * The alignment of the floating spotlight tile, if present.
   */
  const spotlightAlignment$ = new BehaviorSubject<Alignment>({
    inline: "end",
    block: "end",
  });
  /**
   * The size of the small picture-in-picture tile, if present, when in portrait.
   */
  const portraitPipSize$ = scope.behavior(
    showFooter$.pipe(map((showFooter) => (showFooter ? "lg" : "sm"))),
  );
  /**
   * The alignment of the small picture-in-picture tile, if present, when in portrait.
   */
  const portraitPipAlignment$ = new BehaviorSubject<Alignment>({
    inline: "end",
    block: "end",
  });
  /**
   * The alignment of the small picture-in-picture tile, if present, when in landscape.
   */
  const landscapePipAlignment$ = new BehaviorSubject<Alignment>({
    inline: "end",
    block: "start",
  });

  // There is a cyclical dependency here: the layout algorithms want to know
  // which tiles are on screen, but to know which tiles are on screen we have to
  // first render a layout. To deal with this we assume initially that all tiles
  // are visible, and loop the data back into the layouts with a Subject.
  const visibleTiles$ = new Subject<number>();
  const setVisibleTiles = (value: number): void => visibleTiles$.next(value);

  const layoutInternals$ = scope.behavior<LayoutScanState & { layout: Layout }>(
    combineLatest([
      layoutMedia$,
      visibleTiles$.pipe(startWith(Infinity), distinctUntilChanged()),
    ]).pipe(
      scan<
        [LayoutMedia, number],
        LayoutScanState & { layout: Layout },
        LayoutScanState
      >(
        ({ tiles: prevTiles }, [media, visibleTiles]) => {
          let layout: Layout;
          let newTiles: TileStore;
          let pip: GridTileViewModel | undefined;
          let overflowing = false;
          switch (media.type) {
            case "grid":
            case "spotlight-landscape":
            case "spotlight-portrait":
              [layout, newTiles] = gridLikeLayout(
                media,
                spotlightAlignment$,
                visibleTiles,
                setVisibleTiles,
                prevTiles,
              );
              overflowing = newTiles.gridTiles.length > visibleTiles;
              break;
            case "spotlight-expanded":
              [layout, newTiles] = spotlightExpandedLayout(
                media,
                landscapePipAlignment$,
                prevTiles,
              );
              break;
            case "one-on-one-landscape":
              [layout, newTiles] = oneOnOneLandscapeLayout(
                media,
                landscapePipAlignment$,
                prevTiles,
              );
              pip = layout.pip;
              break;
            case "one-on-one-portrait":
              [layout, newTiles] = oneOnOnePortraitLayout(
                media,
                portraitPipSize$,
                portraitPipAlignment$,
                prevTiles,
              );
              pip = layout.pip;
              break;
            case "pip":
              [layout, newTiles] = pipLayout(media, prevTiles);
              break;
          }

          for (const tile of newTiles.gridTiles) {
            tile.setShowOutline(tile === pip);
          }

          return { layout, overflowing, tiles: newTiles };
        },
        { layout: null, overflowing: false, tiles: TileStore.empty() },
      ),
    ),
  );

  /**
   * The layout of tiles in the call interface.
   */
  const layout$ = scope.behavior<Layout>(
    layoutInternals$.pipe(map(({ layout }) => layout)),
  );

  const overflowing$ = scope.behavior<boolean>(
    layoutInternals$.pipe(map(({ overflowing }) => overflowing)),
  );

  /**
   * The current generation of the tile store, exposed for debugging purposes.
   */
  const tileStoreGeneration$ = scope.behavior<number>(
    layoutInternals$.pipe(map(({ tiles }) => tiles.generation)),
  );

  /**
   * Whether audio is currently being output through the earpiece.
   */
  const earpieceMode$ = scope.behavior<boolean>(
    combineLatest(
      [mediaDevices.audioOutput.available$, mediaDevices.audioOutput.selected$],
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
  const audioOutputSwitcher$ = scope.behavior<{
    targetOutput: "earpiece" | "speaker";
    switch: () => void;
  } | null>(
    combineLatest(
      [mediaDevices.audioOutput.available$, mediaDevices.audioOutput.selected$],
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
          switch: (): void => mediaDevices.audioOutput.select(id),
        };
      },
    ),
  );

  /**
   * Emits an array of reactions that should be visible on the screen.
   */
  // DISCUSSION move this into a reaction file
  // const {visibleReactions$, audibleReactions$} = reactionsObservables$(showReactionSetting$, )
  const visibleReactions$ = scope.behavior(
    showReactions.value$.pipe(
      switchMap((show) => (show ? reactions$ : of({}))),
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
  const audibleReactions$ = playReactionsSound.value$.pipe(
    switchMap((show) =>
      show ? reactions$ : of<Record<string, ReactionOption>>({}),
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

  const newHandRaised$ = handsRaised$.pipe(
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

  const newScreenShare$ = screenShares$.pipe(
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
  const sharingScreen$ = localMembership.sharingScreen$;

  /**
   * Callback to toggle screen sharing. If null, screen sharing is not possible.
   */
  // reassigned here to make it publicly accessible
  const toggleScreenSharing =
    options.toggleScreensharing ?? localMembership.toggleScreenSharing;

  const errors$ = scope.behavior<{
    transportError?: ElementCallError;
    matrixError?: ElementCallError;
    connectionError?: ElementCallError;
    publishError?: ElementCallError;
  } | null>(
    localMembership.localMemberState$.pipe(
      map((value) => {
        const returnObject: {
          transportError?: ElementCallError;
          matrixError?: ElementCallError;
          connectionError?: ElementCallError;
          publishError?: ElementCallError;
        } = {};
        if (value instanceof ElementCallError) return { transportError: value };
        if (value === TransportState.Waiting) return null;
        if (value.matrix instanceof ElementCallError)
          returnObject.matrixError = value.matrix;
        if (value.media instanceof ElementCallError)
          returnObject.publishError = value.media;
        else if (
          typeof value.media === "object" &&
          value.media.connection instanceof ElementCallError
        )
          returnObject.connectionError = value.media.connection;
        return returnObject;
      }),
    ),
    null,
  );

  return {
    autoLeave$: autoLeave$,
    ringingVm$: ringingMedia$,
    ringingStatusLocation:
      urlParams.header === HeaderStyle.AppBar ? "app_bar" : "tile",
    leave$: leave$,
    hangup: (): void => userHangup$.next(),
    join: localMembership.requestJoinAndPublish,
    leave: localMembership.requestDisconnect,
    toggleScreenSharing: toggleScreenSharing,
    sharingScreen$: sharingScreen$,

    tapScreen: (): void => screenTap$.next(),
    tapControls: (): void => controlsTap$.next(),
    hoverScreen: (): void => screenHover$.next(),
    unhoverScreen: (): void => screenUnhover$.next(),

    fatalError$: scope.behavior(
      errors$.pipe(
        map((errors) => {
          logger.debug("errors$ to compute any fatal errors:", errors);
          return (
            errors?.transportError ??
            errors?.matrixError ??
            errors?.connectionError ??
            null
          );
        }),
        filter((error) => error !== null),
      ),
      null,
    ),
    allConnections$,
    participantCount$: participantCount$,
    handsRaised$: handsRaised$,
    reactions$: reactions$,
    joinSoundEffect$: joinSoundEffect$,
    leaveSoundEffect$: leaveSoundEffect$,
    newHandRaised$: newHandRaised$,
    newScreenShare$: newScreenShare$,
    audibleReactions$: audibleReactions$,
    visibleReactions$: visibleReactions$,

    spotlightExpanded$: spotlightExpanded$,
    toggleSpotlightExpanded$: toggleSpotlightExpanded$,
    gridMode$: gridMode$,
    setGridMode: setGridMode,
    layout$: layout$,
    localMatrixLivekitMember$,
    remoteMatrixLivekitMembers$: scope.behavior(
      remoteMatrixLivekitMembers$.pipe(
        map((members) => members.value),
        tap((v) => {
          const listForLogs = v
            .map(
              (m) =>
                m.membership$.value.userId + "|" + m.membership$.value.deviceId,
            )
            .join(",");
          logger.debug(
            `matrixLivekitMembers$ updated (exported) [${listForLogs}]`,
          );
        }),
      ),
    ),
    tileStoreGeneration$: tileStoreGeneration$,
    showSpotlightIndicators$: showSpotlightIndicators$,
    showSpeakingIndicators$: showSpeakingIndicators$,
    showNameTags$,
    showHeader$: showHeader$,
    showFooter$: showFooter$,
    settingsOpen$: settingsOpen$,
    setSettingsOpen$: setSettingsOpen$,
    edgeToEdge$,
    overflowing$,
    earpieceMode$: earpieceMode$,
    audioOutputSwitcher$: audioOutputSwitcher$,
    reconnecting$: localMembership.reconnecting$,
    livekitRoomItems$,
    connected$: localMembership.connected$,
  };
}

function getE2eeKeyProvider(
  e2eeSystem: EncryptionSystem,
  rtcSession: MatrixRTCSession,
  logger: Logger,
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
