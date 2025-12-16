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
import {
  type LivekitTransport,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { type IWidgetApiRequest } from "matrix-widget-api";

import {
  LocalUserMediaViewModel,
  type MediaViewModel,
  type RemoteUserMediaViewModel,
  ScreenShareViewModel,
  type UserMediaViewModel,
} from "../MediaViewModel";
import {
  accumulate,
  filterBehavior,
  generateItems,
  pauseWhen,
} from "../../utils/observable";
import {
  duplicateTiles,
  MatrixRTCMode,
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
import { type Behavior } from "../Behavior";
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
import { ElementCallError } from "../../utils/errors.ts";
import { type ObservableScope } from "../ObservableScope.ts";
import { createHomeserverConnected$ } from "./localMember/HomeserverConnected.ts";
import {
  createLocalMembership$,
  enterRTCSession,
  TransportState,
} from "./localMember/LocalMember.ts";
import { createLocalTransport$ } from "./localMember/LocalTransport.ts";
import {
  createMemberships$,
  membershipsAndTransports$,
} from "../SessionBehaviors.ts";
import { ECConnectionFactory } from "./remoteMembers/ConnectionFactory.ts";
import { createConnectionManager$ } from "./remoteMembers/ConnectionManager.ts";
import {
  createMatrixLivekitMembers$,
  type TaggedParticipant,
  type LocalMatrixLivekitMember,
} from "./remoteMembers/MatrixLivekitMembers.ts";
import {
  type AutoLeaveReason,
  createCallNotificationLifecycle$,
  createReceivedDecline$,
  createSentCallNotification$,
} from "./CallNotificationLifecycle.ts";
import {
  createDMMember$,
  createMatrixMemberMetadata$,
  createRoomMembers$,
} from "./remoteMembers/MatrixMemberMetadata.ts";
import { Publisher } from "./localMember/Publisher.ts";
import { type Connection } from "./remoteMembers/Connection.ts";
import { createLayoutModeSwitch } from "./LayoutSwitch.ts";

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
  /** Optional behavior overriding the computed window size, mainly for testing purposes. */
  windowSize$?: Behavior<{ width: number; height: number }>;
  /** The version & compatibility mode of MatrixRTC that we should use. */
  matrixRTCMode$: Behavior<MatrixRTCMode>;
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
  // TODO if we are in "unknown" state we need a loading rendering (or empty screen)
  // Otherwise it looks like we already connected and only than the ringing starts which is weird.
  callPickupState$: Behavior<
    "unknown" | "ringing" | "timeout" | "decline" | "success" | null
  >;
  leave$: Observable<"user" | AutoLeaveReason>;
  /** Call to initiate hangup. Use in conbination with connectino state track the async hangup process. */
  hangup: () => void;

  // joining
  join: () => void;

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
  /** Participants sorted by livekit room so they can be used in the audio rendering */
  audioParticipants$: Behavior<AudioLivekitItem[]>;
  /** List of participants raising their hand */
  handsRaised$: Behavior<Record<string, RaisedHandInfo>>;
  /** List of reactions. Keys are: membership.membershipId (currently predefined as: `${membershipEvent.userId}:${membershipEvent.deviceId}`)*/
  reactions$: Behavior<Record<string, ReactionOption>>;

  ringOverlay$: Behavior<null | {
    name: string;
    /** roomId or userId for the avatar generation. */
    idForAvatar: string;
    text: string;
    avatarMxc?: string;
  }>;
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

  // window/layout
  /**
   * The general shape of the window.
   */
  windowMode$: Behavior<WindowMode>;
  spotlightExpanded$: Behavior<boolean>;
  toggleSpotlightExpanded$: Behavior<(() => void) | null>;
  gridMode$: Behavior<GridMode>;
  setGridMode: (value: GridMode) => void;

  // media view models and layout
  grid$: Behavior<UserMediaViewModel[]>;
  spotlight$: Behavior<MediaViewModel[]>;
  pip$: Behavior<UserMediaViewModel | null>;
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

  // header/footer visibility
  showHeader$: Behavior<boolean>;
  showFooter$: Behavior<boolean>;

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

  // connection state
  /**
   * Whether various media/event sources should pretend to be disconnected from
   * all network input, even if their connection still technically works.
   */
  // We do this when the app is in the 'reconnecting' state, because it might be
  // that the LiveKit connection is still functional while the homeserver is
  // down, for example, and we want to avoid making people worry that the app is
  // in a split-brained state.
  // DISCUSSION own membership manager ALSO this probably can be simplifis
  reconnecting$: Behavior<boolean>;
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
  const client = matrixRoom.client;
  const userId = client.getUserId()!;
  const deviceId = client.getDeviceId()!;
  const livekitKeyProvider = getE2eeKeyProvider(
    options.encryptionSystem,
    matrixRTCSession,
  );

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

  const localTransport$ = createLocalTransport$({
    scope: scope,
    memberships$: memberships$,
    client,
    roomId: matrixRoom.roomId,
    useOldestMember$: scope.behavior(
      options.matrixRTCMode$.pipe(map((v) => v === MatrixRTCMode.Legacy)),
    ),
  });

  const connectionFactory = new ECConnectionFactory(
    client,
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
    inputTransports$: scope.behavior(
      combineLatest(
        [
          localTransport$.pipe(
            catchError((e: unknown) => {
              logger.info(
                "dont pass local transport to createConnectionManager$. localTransport$ threw an error",
                e,
              );
              return of(null);
            }),
          ),
          membershipsAndTransports.transports$,
        ],
        (localTransport, transports) => {
          const localTransportAsArray = localTransport ? [localTransport] : [];
          return transports.mapInner((transports) => [
            ...localTransportAsArray,
            ...transports,
          ]);
        },
      ),
    ),
    logger: logger,
  });

  const matrixLivekitMembers$ = createMatrixLivekitMembers$({
    scope: scope,
    membershipsWithTransport$:
      membershipsAndTransports.membershipsWithTransport$,
    connectionManager: connectionManager,
  });

  const connectOptions$ = scope.behavior(
    options.matrixRTCMode$.pipe(
      map((mode) => ({
        encryptMedia: livekitKeyProvider !== undefined,
        // TODO. This might need to get called again on each change of matrixRTCMode...
        matrixRTCMode: mode,
      })),
    ),
  );

  const localMembership = createLocalMembership$({
    scope: scope,
    homeserverConnected: createHomeserverConnected$(
      scope,
      client,
      matrixRTCSession,
    ),
    muteStates: muteStates,
    joinMatrixRTC: (transport: LivekitTransport) => {
      return enterRTCSession(
        matrixRTCSession,
        transport,
        connectOptions$.value,
      );
    },
    createPublisherFactory: (connection: Connection) => {
      return new Publisher(
        scope,
        connection,
        mediaDevices,
        muteStates,
        trackProcessorState$,
        logger.getChild(
          "[Publisher" + connection.transport.livekit_service_url + "]",
        ),
      );
    },
    connectionManager: connectionManager,
    matrixRTCSession: matrixRTCSession,
    localTransport$: localTransport$,
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

  // ------------------------------------------------------------------------
  // callLifecycle

  // TODO if we are in "unknown" state we need a loading rendering (or empty screen)
  // Otherwise it looks like we already connected and only than the ringing starts which is weird.
  const { callPickupState$, autoLeave$ } = createCallNotificationLifecycle$({
    scope: scope,
    memberships$: memberships$,
    sentCallNotification$: createSentCallNotification$(scope, matrixRTCSession),
    receivedDecline$: createReceivedDecline$(matrixRoom),
    options: options,
    localUser: { userId: userId, deviceId: deviceId },
  });

  // ------------------------------------------------------------------------
  // matrixMemberMetadataStore

  const matrixRoomMembers$ = createRoomMembers$(scope, matrixRoom);
  const matrixMemberMetadataStore = createMatrixMemberMetadata$(
    scope,
    scope.behavior(memberships$.pipe(map((mems) => mems.value))),
    matrixRoomMembers$,
  );

  const dmMember$ = createDMMember$(scope, matrixRoomMembers$, matrixRoom);
  const noUserToCallInRoom$ = scope.behavior(
    matrixRoomMembers$.pipe(
      map(
        (roomMembersMap) =>
          roomMembersMap.size === 1 && roomMembersMap.get(userId) !== undefined,
      ),
    ),
  );

  const ringOverlay$ = scope.behavior(
    combineLatest([noUserToCallInRoom$, dmMember$, callPickupState$]).pipe(
      map(([noUserToCallInRoom, dmMember, callPickupState]) => {
        // No overlay if not in ringing state
        if (callPickupState !== "ringing" || noUserToCallInRoom) return null;

        const name = dmMember ? dmMember.rawDisplayName : matrixRoom.name;
        const id = dmMember ? dmMember.userId : matrixRoom.roomId;
        const text = dmMember
          ? `Waiting for ${name} to join…`
          : "Waiting for other participants…";
        const avatarMxc = dmMember
          ? (dmMember.getMxcAvatarUrl?.() ?? undefined)
          : (matrixRoom.getMxcAvatarUrl() ?? undefined);
        return {
          name: name ?? id,
          idForAvatar: id,
          text,
          avatarMxc,
        };
      }),
    ),
  );

  const audioParticipants$ = scope.behavior(
    matrixLivekitMembers$.pipe(
      switchMap((membersWithEpoch) => {
        const members = membersWithEpoch.value;
        const a$ = combineLatest(
          members.map((member) =>
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
        members.reduce<AudioLivekitItem[]>((acc, curr) => {
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
  const userMedia$ = scope.behavior<UserMedia[]>(
    combineLatest([
      localMatrixLivekitMember$,
      matrixLivekitMembers$,
      duplicateTiles.value$,
    ]).pipe(
      // Generate a collection of MediaItems from the list of expected (whether
      // present or missing) LiveKit participants.
      generateItems(
        function* ([
          localMatrixLivekitMember,
          { value: matrixLivekitMembers },
          duplicateTiles,
        ]) {
          let localParticipantId: string | undefined = undefined;
          // add local member if available
          if (localMatrixLivekitMember) {
            const { userId, participant, connection$, membership$ } =
              localMatrixLivekitMember;
            localParticipantId = `${userId}:${membership$.value.deviceId}`; // should be membership$.value.membershipID which is not optional
            // const participantId = membership$.value.membershipID;
            if (localParticipantId) {
              for (let dup = 0; dup < 1 + duplicateTiles; dup++) {
                yield {
                  keys: [
                    dup,
                    localParticipantId,
                    userId,
                    participant satisfies TaggedParticipant as TaggedParticipant, // Widen the type safely
                    connection$,
                  ],
                  data: undefined,
                };
              }
            }
          }
          // add remote members that are available
          for (const {
            userId,
            participant,
            connection$,
            membership$,
          } of matrixLivekitMembers) {
            const participantId = `${userId}:${membership$.value.deviceId}`;
            if (participantId === localParticipantId) continue;
            // const participantId = membership$.value?.identity;
            for (let dup = 0; dup < 1 + duplicateTiles; dup++) {
              yield {
                keys: [dup, participantId, userId, participant, connection$],
                data: undefined,
              };
            }
          }
        },
        (
          scope,
          _data$,
          dup,
          participantId,
          userId,
          participant,
          connection$,
        ) => {
          const livekitRoom$ = scope.behavior(
            connection$.pipe(map((c) => c?.livekitRoom)),
          );
          const focusUrl$ = scope.behavior(
            connection$.pipe(map((c) => c?.transport.livekit_service_url)),
          );
          const displayName$ = scope.behavior(
            matrixMemberMetadataStore
              .createDisplayNameBehavior$(userId)
              .pipe(map((name) => name ?? userId)),
          );

          return new UserMedia(
            scope,
            `${participantId}:${dup}`,
            userId,
            participant,
            options.encryptionSystem,
            livekitRoom$,
            focusUrl$,
            mediaDevices,
            localMembership.reconnecting$,
            displayName$,
            matrixMemberMetadataStore.createAvatarUrlBehavior$(userId),
            handsRaised$.pipe(map((v) => v[participantId]?.time ?? null)),
            reactions$.pipe(map((v) => v[participantId] ?? undefined)),
          );
        },
      ),
    ),
  );

  /**
   * List of all media items (user media and screen share media) that we want
   * tiles for.
   */
  const mediaItems$ = scope.behavior<MediaItem[]>(
    userMedia$.pipe(
      switchMap((userMedia) =>
        userMedia.length === 0
          ? of([])
          : combineLatest(
              userMedia.map((m) => m.screenShares$),
              (...screenShares) => [...userMedia, ...screenShares.flat(1)],
            ),
      ),
    ),
  );

  /**
   * List of MediaItems that we want to display, that are of type ScreenShare
   */
  const screenShares$ = scope.behavior<ScreenShare[]>(
    mediaItems$.pipe(
      map((mediaItems) =>
        mediaItems.filter((m): m is ScreenShare => m instanceof ScreenShare),
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
    matrixLivekitMembers$.pipe(map((ms) => ms.value.length)),
  );

  const leaveSoundEffect$ = combineLatest([callPickupState$, userMedia$]).pipe(
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

  const spotlightSpeaker$ = scope.behavior<UserMediaViewModel | null>(
    userMedia$.pipe(
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
              bins.sort(([, bin1], [, bin2]) => bin1 - bin2).map(([m]) => m.vm),
            );
      }),
      distinctUntilChanged(shallowEquals),
    ),
  );

  const spotlight$ = scope.behavior<MediaViewModel[]>(
    screenShares$.pipe(
      switchMap((screenShares) => {
        if (screenShares.length > 0) {
          return of(screenShares.map((m) => m.vm));
        }

        return spotlightSpeaker$.pipe(
          map((speaker) => (speaker ? [speaker] : [])),
        );
      }),
      distinctUntilChanged<MediaViewModel[]>(shallowEquals),
    ),
  );

  const pip$ = scope.behavior<UserMediaViewModel | null>(
    combineLatest([
      // TODO This also needs epoch logic to dedupe the screenshares and mediaItems emits
      screenShares$,
      spotlightSpeaker$,
      mediaItems$,
    ]).pipe(
      switchMap(([screenShares, spotlight, mediaItems]) => {
        if (screenShares.length > 0) {
          return spotlightSpeaker$;
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

  const hasRemoteScreenShares$ = scope.behavior<boolean>(
    spotlight$.pipe(
      map((spotlight) =>
        spotlight.some((vm) => !vm.local && vm instanceof ScreenShareViewModel),
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
  const spotlightExpanded$ = scope.behavior<boolean>(
    spotlightExpandedToggle$.pipe(accumulate(false, (expanded) => !expanded)),
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
      spotlight: spotlight.some((vm) => vm instanceof ScreenShareViewModel)
        ? spotlight
        : undefined,
      grid,
    }),
  );

  const spotlightLandscapeLayoutMedia$: Observable<SpotlightLandscapeLayoutMedia> =
    combineLatest([grid$, spotlight$], (grid, spotlight) => ({
      type: "spotlight-landscape",
      spotlight,
      grid,
    }));

  const spotlightPortraitLayoutMedia$: Observable<SpotlightPortraitLayoutMedia> =
    combineLatest([grid$, spotlight$], (grid, spotlight) => ({
      type: "spotlight-portrait",
      spotlight,
      grid,
    }));

  const spotlightExpandedLayoutMedia$: Observable<SpotlightExpandedLayoutMedia> =
    combineLatest([spotlight$, pip$], (spotlight, pip) => ({
      type: "spotlight-expanded",
      spotlight,
      pip: pip ?? undefined,
    }));

  const oneOnOneLayoutMedia$: Observable<OneOnOneLayoutMedia | null> =
    mediaItems$.pipe(
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

  const pipLayoutMedia$: Observable<LayoutMedia> = spotlight$.pipe(
    map((spotlight) => ({ type: "pip", spotlight })),
  );

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
                    return oneOnOneLayoutMedia$.pipe(
                      switchMap((oneOnOne) =>
                        oneOnOne === null ? gridLayoutMedia$ : of(oneOnOne),
                      ),
                    );
                  case "spotlight":
                    return spotlightExpanded$.pipe(
                      switchMap((expanded) =>
                        expanded
                          ? spotlightExpandedLayoutMedia$
                          : spotlightLandscapeLayoutMedia$,
                      ),
                    );
                }
              }),
            );
          case "narrow":
            return oneOnOneLayoutMedia$.pipe(
              switchMap((oneOnOne) =>
                oneOnOne === null
                  ? combineLatest([grid$, spotlight$], (grid, spotlight) =>
                      grid.length > smallMobileCallThreshold ||
                      spotlight.some((vm) => vm instanceof ScreenShareViewModel)
                        ? spotlightPortraitLayoutMedia$
                        : gridLayoutMedia$,
                    ).pipe(switchAll())
                  : // The expanded spotlight layout makes for a better one-on-one
                    // experience in narrow windows
                    spotlightExpandedLayoutMedia$,
              ),
            );
          case "flat":
            return gridMode$.pipe(
              switchMap((gridMode) => {
                switch (gridMode) {
                  case "grid":
                    // Yes, grid mode actually gets you a "spotlight" layout in
                    // this window mode.
                    return spotlightLandscapeLayoutMedia$;
                  case "spotlight":
                    return spotlightExpandedLayoutMedia$;
                }
              }),
            );
          case "pip":
            return pipLayoutMedia$;
        }
      }),
    ),
  );

  // There is a cyclical dependency here: the layout algorithms want to know
  // which tiles are on screen, but to know which tiles are on screen we have to
  // first render a layout. To deal with this we assume initially that no tiles
  // are visible, and loop the data back into the layouts with a Subject.
  const visibleTiles$ = new Subject<number>();
  const setVisibleTiles = (value: number): void => visibleTiles$.next(value);

  const layoutInternals$ = scope.behavior<LayoutScanState & { layout: Layout }>(
    combineLatest([
      layoutMedia$,
      visibleTiles$.pipe(startWith(0), distinctUntilChanged()),
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
                setVisibleTiles,
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
  const layout$ = scope.behavior<Layout>(
    layoutInternals$.pipe(map(({ layout }) => layout)),
  );

  /**
   * The current generation of the tile store, exposed for debugging purposes.
   */
  const tileStoreGeneration$ = scope.behavior<number>(
    layoutInternals$.pipe(map(({ tiles }) => tiles.generation)),
  );

  const showSpotlightIndicators$ = scope.behavior<boolean>(
    layout$.pipe(map((l) => l.type !== "grid")),
  );

  const showSpeakingIndicators$ = scope.behavior<boolean>(
    layout$.pipe(
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

  const toggleSpotlightExpanded$ = scope.behavior<(() => void) | null>(
    windowMode$.pipe(
      switchMap((mode) =>
        mode === "normal"
          ? layout$.pipe(
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

  const screenTap$ = new Subject<void>();
  const controlsTap$ = new Subject<void>();
  const screenHover$ = new Subject<void>();
  const screenUnhover$ = new Subject<void>();

  const showHeader$ = scope.behavior<boolean>(
    windowMode$.pipe(map((mode) => mode !== "pip" && mode !== "flat")),
  );

  const showFooter$ = scope.behavior<boolean>(
    windowMode$.pipe(
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
                      screenUnhover$.pipe(take(1)),
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
  const toggleScreenSharing = localMembership.toggleScreenSharing;

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
    callPickupState$: callPickupState$,
    ringOverlay$: ringOverlay$,
    leave$: leave$,
    hangup: (): void => userHangup$.next(),
    join: localMembership.requestJoinAndPublish,
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

    participantCount$: participantCount$,
    audioParticipants$: audioParticipants$,

    handsRaised$: handsRaised$,
    reactions$: reactions$,
    joinSoundEffect$: joinSoundEffect$,
    leaveSoundEffect$: leaveSoundEffect$,
    newHandRaised$: newHandRaised$,
    newScreenShare$: newScreenShare$,
    audibleReactions$: audibleReactions$,
    visibleReactions$: visibleReactions$,

    windowMode$: windowMode$,
    spotlightExpanded$: spotlightExpanded$,
    toggleSpotlightExpanded$: toggleSpotlightExpanded$,
    gridMode$: gridMode$,
    setGridMode: setGridMode,
    grid$: grid$,
    spotlight$: spotlight$,
    pip$: pip$,
    layout$: layout$,
    tileStoreGeneration$: tileStoreGeneration$,
    showSpotlightIndicators$: showSpotlightIndicators$,
    showSpeakingIndicators$: showSpeakingIndicators$,
    showHeader$: showHeader$,
    showFooter$: showFooter$,
    earpieceMode$: earpieceMode$,
    audioOutputSwitcher$: audioOutputSwitcher$,
    reconnecting$: localMembership.reconnecting$,
  };
}

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
