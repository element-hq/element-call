/*
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
import { type RoomMember, type Room as MatrixRoom } from "matrix-js-sdk";
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
import { accumulate, generateItems, pauseWhen } from "../../utils/observable";
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
import { type ElementCallError } from "../../utils/errors.ts";
import { type ObservableScope } from "../ObservableScope.ts";
import {
  createLocalMembership$,
  type LocalMemberConnectionState,
} from "./localMember/LocalMembership.ts";
import { createLocalTransport$ } from "./localMember/LocalTransport.ts";
import {
  createMemberships$,
  membershipsAndTransports$,
} from "../SessionBehaviors.ts";
import { ECConnectionFactory } from "./remoteMembers/ConnectionFactory.ts";
import { createConnectionManager$ } from "./remoteMembers/ConnectionManager.ts";
import {
  createMatrixLivekitMembers$,
  type MatrixLivekitMember,
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
  // lifecycle
  public autoLeave$: Observable<AutoLeaveReason>;
  // TODO if we are in "unknown" state we need a loading rendering (or empty screen)
  // Otherwise it looks like we already connected and only than the ringing starts which is weird.
  public callPickupState$: Behavior<
    "unknown" | "ringing" | "timeout" | "decline" | "success" | null
  >;
  public leave$: Observable<"user" | AutoLeaveReason>;
  /** Call to initiate hangup. Use in conbination with connectino state track the async hangup process. */
  public hangup: () => void;

  // joining
  public join: () => LocalMemberConnectionState;

  // screen sharing
  /**
   * Callback to toggle screen sharing. If null, screen sharing is not possible.
   */
  public toggleScreenSharing: (() => void) | null;
  /**
   * Whether we are sharing our screen.
   */
  public sharingScreen$: Behavior<boolean>;

  // UI interactions
  /**
   * Callback for when the user taps the call view.
   */
  public tapScreen: () => void;
  /**
   * Callback for when the user taps the call's controls.
   */
  public tapControls: () => void;
  /**
   * Callback for when the user hovers over the call view.
   */
  public hoverScreen: () => void;
  /**
   * Callback for when the user stops hovering over the call view.
   */
  public unhoverScreen: () => void;

  // errors
  /**
   * If there is a configuration error with the call (e.g. misconfigured E2EE).
   * This is a fatal error that prevents the call from being created/joined.
   * Should render a blocking error screen.
   */
  public configError$: Behavior<ElementCallError | null>;

  // participants and counts
  /**
   * The number of participants currently in the call.
   *
   *  - Each participant has a corresponding MatrixRTC membership state event
   *  - There can be multiple participants for one Matrix user if they join from
   *    multiple devices.
   */
  public participantCount$: Behavior<number>;
  /** Participants sorted by livekit room so they can be used in the audio rendering */
  public audioParticipants$: Behavior<AudioLivekitItem[]>;
  /** List of participants raising their hand */
  public handsRaised$: Behavior<Record<string, RaisedHandInfo>>;
  /** List of reactions. Keys are: membership.membershipId (currently predefined as: `${membershipEvent.userId}:${membershipEvent.deviceId}`)*/
  public reactions$: Behavior<Record<string, ReactionOption>>;
  public isOneOnOneWith$: Behavior<Pick<
    RoomMember,
    "userId" | "getMxcAvatarUrl" | "rawDisplayName"
  > | null>;
  public localUserIsAlone$: Behavior<boolean>;
  // sounds and events
  public joinSoundEffect$: Observable<void>;
  public leaveSoundEffect$: Observable<void>;
  /**
   * Emits an event every time a new hand is raised in
   * the call.
   */
  public newHandRaised$: Observable<{ value: number; playSounds: boolean }>;
  /**
   * Emits an event every time a new screenshare is started in
   * the call.
   */
  public newScreenShare$: Observable<{ value: number; playSounds: boolean }>;
  /**
   * Emits an array of reactions that should be played.
   */
  public audibleReactions$: Observable<string[]>;
  /**
   * Emits an array of reactions that should be visible on the screen.
   */
  // DISCUSSION move this into a reaction file
  public visibleReactions$: Behavior<
    { sender: string; emoji: string; startX: number }[]
  >;

  // window/layout
  /**
   * The general shape of the window.
   */
  public windowMode$: Behavior<WindowMode>;
  public spotlightExpanded$: Behavior<boolean>;
  public toggleSpotlightExpanded$: Behavior<(() => void) | null>;
  public gridMode$: Behavior<GridMode>;
  public setGridMode: (value: GridMode) => void;

  // media view models and layout
  public grid$: Behavior<UserMediaViewModel[]>;
  public spotlight$: Behavior<MediaViewModel[]>;
  public pip$: Behavior<UserMediaViewModel | null>;
  /**
   * The layout of tiles in the call interface.
   */
  public layout$: Behavior<Layout>;
  /**
   * The current generation of the tile store, exposed for debugging purposes.
   */
  public tileStoreGeneration$: Behavior<number>;
  public showSpotlightIndicators$: Behavior<boolean>;
  public showSpeakingIndicators$: Behavior<boolean>;

  // header/footer visibility
  public showHeader$: Behavior<boolean>;
  public showFooter$: Behavior<boolean>;

  // audio routing
  /**
   * Whether audio is currently being output through the earpiece.
   */
  public earpieceMode$: Behavior<boolean>;
  /**
   * Callback to toggle between the earpiece and the loudspeaker.
   *
   * This will be `null` in case the target does not exist in the list
   * of available audio outputs.
   */
  public audioOutputSwitcher$: Behavior<{
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
  public reconnecting$: Behavior<boolean>;

  // THIS has to be the last public field declaration
  public constructor(
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
  ) {
    const userId = matrixRoom.client.getUserId()!;
    const deviceId = matrixRoom.client.getDeviceId()!;

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
    // The creation of the values under the bar are all tested independently and testing the callViewModel Should
    // not test their cretation. Call view model only needs:
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
      client: matrixRoom.client,
      roomId: matrixRoom.roomId,
      useOldestMember$: scope.behavior(
        matrixRTCMode.value$.pipe(map((v) => v === MatrixRTCMode.Legacy)),
      ),
    });

    const connectionFactory = new ECConnectionFactory(
      matrixRoom.client,
      mediaDevices,
      trackProcessorState$,
      livekitKeyProvider,
      getUrlParams().controlledAudioDevices,
      options.livekitRoomFactory,
    );

    const connectionManager = createConnectionManager$({
      scope: scope,
      connectionFactory: connectionFactory,
      inputTransports$: scope.behavior(
        combineLatest(
          [localTransport$, membershipsAndTransports.transports$],
          (localTransport, transports) => {
            const localTransportAsArray = localTransport
              ? [localTransport]
              : [];
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
      matrixRTCMode.value$.pipe(
        map((mode) => ({
          encryptMedia: livekitKeyProvider !== undefined,
          // TODO. This might need to get called again on each cahnge of matrixRTCMode...
          matrixRTCMode: mode,
        })),
      ),
    );

    const localMembership = createLocalMembership$({
      scope: scope,
      muteStates: muteStates,
      mediaDevices: mediaDevices,
      connectionManager: connectionManager,
      matrixRTCSession: matrixRTCSession,
      matrixRoom: matrixRoom,
      localTransport$: localTransport$,
      trackProcessorState$: trackProcessorState$,
      widget,
      options: connectOptions$,
      logger: logger.getChild(`[${Date.now()}]`),
    });

    const localRtcMembership$ = scope.behavior(
      memberships$.pipe(
        map(
          (memberships) =>
            memberships.value.find(
              (membership) =>
                membership.userId === userId &&
                membership.deviceId === deviceId,
            ) ?? null,
        ),
      ),
    );

    const localMatrixLivekitMemberUninitialized = {
      membership$: localRtcMembership$,
      participant$: localMembership.participant$,
      connection$: localMembership.connection$,
      userId: userId,
    };

    const localMatrixLivekitMember$: Behavior<MatrixLivekitMember | null> =
      scope.behavior(
        localRtcMembership$.pipe(
          switchMap((membership) => {
            if (!membership) return of(null);
            return of(
              // casting is save here since we know that localRtcMembership$ is !== null since we reached this case.
              localMatrixLivekitMemberUninitialized as MatrixLivekitMember,
            );
          }),
        ),
      );

    // ------------------------------------------------------------------------
    // callLifecycle

    const callLifecycle = createCallNotificationLifecycle$({
      scope: scope,
      memberships$: memberships$,
      sentCallNotification$: createSentCallNotification$(
        scope,
        matrixRTCSession,
      ),
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

    /**
     * Returns the Member {userId, getMxcAvatarUrl, rawDisplayName} of the other user in the call, if it's a one-on-one call.
     */
    const isOneOnOneWith$ = scope.behavior(
      matrixRoomMembers$.pipe(
        map((roomMembersMap) => {
          const otherMembers = Array.from(roomMembersMap.values()).filter(
            (member) => member.userId !== userId,
          );
          return otherMembers.length === 1 ? otherMembers[0] : null;
        }),
      ),
    );

    const localUserIsAlone$ = scope.behavior(
      matrixRoomMembers$.pipe(
        map(
          (roomMembersMap) =>
            roomMembersMap.size === 1 &&
            roomMembersMap.get(userId) !== undefined,
        ),
      ),
    );

    // CODESMELL?
    // This is functionally the same Observable as leave$, except here it's
    // hoisted to the top of the class. This enables the cyclic dependency between
    // leave$ -> autoLeave$ -> callPickupState$ -> livekitConnectionState$ ->
    // localConnection$ -> transports$ -> joined$ -> leave$.
    const leaveHoisted$ = new Subject<
      "user" | "timeout" | "decline" | "allOthersLeft"
    >();

    /**
     * Whether various media/event sources should pretend to be disconnected from
     * all network input, even if their connection still technically works.
     */
    // We do this when the app is in the 'reconnecting' state, because it might be
    // that the LiveKit connection is still functional while the homeserver is
    // down, for example, and we want to avoid making people worry that the app is
    // in a split-brained state.
    // DISCUSSION own membership manager ALSO this probably can be simplifis
    const reconnecting$ = localMembership.reconnecting$;
    const pretendToBeDisconnected$ = reconnecting$;

    const audioParticipants$ = scope.behavior(
      matrixLivekitMembers$.pipe(
        switchMap((membersWithEpoch) => {
          const members = membersWithEpoch.value;
          const a$ = combineLatest(
            members.map((member) =>
              combineLatest([member.connection$, member.participant$]).pipe(
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
      handsRaisedSubject$.pipe(pauseWhen(pretendToBeDisconnected$)),
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
        pauseWhen(pretendToBeDisconnected$),
      ),
    );

    /**
     * List of user media (camera feeds) that we want tiles for.
     */
    // TODO this also needs the local participant to be added.
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
            let localParticipantId = undefined;
            // add local member if available
            if (localMatrixLivekitMember) {
              const { userId, participant$, connection$, membership$ } =
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
                      participant$,
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
              participant$,
              connection$,
              membership$,
            } of matrixLivekitMembers) {
              const participantId = `${userId}:${membership$.value.deviceId}`;
              if (participantId === localParticipantId) continue;
              // const participantId = membership$.value?.identity;
              for (let dup = 0; dup < 1 + duplicateTiles; dup++) {
                yield {
                  keys: [dup, participantId, userId, participant$, connection$],
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
            participant$,
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
              participant$,
              options.encryptionSystem,
              livekitRoom$,
              focusUrl$,
              mediaDevices,
              pretendToBeDisconnected$,
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

    // only public to expose to the view.
    // TODO if we are in "unknown" state we need a loading rendering (or empty screen)
    // Otherwise it looks like we already connected and only than the ringing starts which is weird.
    const callPickupState$ = callLifecycle.callPickupState$;

    const leaveSoundEffect$ = combineLatest([
      callLifecycle.callPickupState$,
      userMedia$,
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
        callLifecycle.autoLeave$,
        merge(userHangup$, widgetHangup$).pipe(map(() => "user" as const)),
      ).pipe(
        scope.share,
        tap((reason) => leaveHoisted$.next(reason)),
      );

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
                bins
                  .sort(([, bin1], [, bin2]) => bin1 - bin2)
                  .map(([m]) => m.vm),
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

    const hasRemoteScreenShares$: Observable<boolean> = spotlight$.pipe(
      map((spotlight) =>
        spotlight.some((vm) => !vm.local && vm instanceof ScreenShareViewModel),
      ),
      distinctUntilChanged(),
    );

    const pipEnabled$ = scope.behavior(setPipEnabled$, false);

    const naturalWindowMode$ = scope.behavior<WindowMode>(
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
    const windowMode$ = scope.behavior<WindowMode>(
      pipEnabled$.pipe(
        switchMap((pip) => (pip ? of<WindowMode>("pip") : naturalWindowMode$)),
      ),
    );

    const spotlightExpandedToggle$ = new Subject<void>();
    const spotlightExpanded$ = scope.behavior<boolean>(
      spotlightExpandedToggle$.pipe(accumulate(false, (expanded) => !expanded)),
    );

    const gridModeUserSelection$ = new Subject<GridMode>();
    /**
     * The layout mode of the media tile grid.
     */
    const gridMode$ =
      // If the user hasn't selected spotlight and somebody starts screen sharing,
      // automatically switch to spotlight mode and reset when screen sharing ends
      scope.behavior<GridMode>(
        gridModeUserSelection$.pipe(
          switchMap((userSelection) =>
            (userSelection === "spotlight"
              ? EMPTY
              : combineLatest([hasRemoteScreenShares$, windowMode$]).pipe(
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

    const setGridMode = (value: GridMode): void => {
      gridModeUserSelection$.next(value);
    };

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
                        spotlight.some(
                          (vm) => vm instanceof ScreenShareViewModel,
                        )
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

    const layoutInternals$ = scope.behavior<
      LayoutScanState & { layout: Layout }
    >(
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
        [
          mediaDevices.audioOutput.available$,
          mediaDevices.audioOutput.selected$,
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
    const audioOutputSwitcher$ = scope.behavior<{
      targetOutput: "earpiece" | "speaker";
      switch: () => void;
    } | null>(
      combineLatest(
        [
          mediaDevices.audioOutput.available$,
          mediaDevices.audioOutput.selected$,
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
          const newSet: { sender: string; emoji: string; startX: number }[] =
            [];
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

    const join = localMembership.requestConnect;
    join(); // TODO-MULTI-SFU: Use this view model for the lobby as well, and only call this once 'join' is clicked?

    this.autoLeave$ = callLifecycle.autoLeave$;
    this.callPickupState$ = callPickupState$;
    this.leave$ = leave$;
    this.hangup = (): void => userHangup$.next();
    this.join = join;
    this.toggleScreenSharing = toggleScreenSharing;
    this.sharingScreen$ = sharingScreen$;

    this.tapScreen = (): void => screenTap$.next();
    this.tapControls = (): void => controlsTap$.next();
    this.hoverScreen = (): void => screenHover$.next();
    this.unhoverScreen = (): void => screenUnhover$.next();

    this.configError$ = localMembership.configError$;
    this.participantCount$ = participantCount$;
    this.audioParticipants$ = audioParticipants$;
    this.isOneOnOneWith$ = isOneOnOneWith$;
    this.localUserIsAlone$ = localUserIsAlone$;

    this.handsRaised$ = handsRaised$;
    this.reactions$ = reactions$;
    this.joinSoundEffect$ = joinSoundEffect$;
    this.leaveSoundEffect$ = leaveSoundEffect$;
    this.newHandRaised$ = newHandRaised$;
    this.newScreenShare$ = newScreenShare$;
    this.audibleReactions$ = audibleReactions$;
    this.visibleReactions$ = visibleReactions$;

    this.windowMode$ = windowMode$;
    this.spotlightExpanded$ = spotlightExpanded$;
    this.toggleSpotlightExpanded$ = toggleSpotlightExpanded$;
    this.gridMode$ = gridMode$;
    this.setGridMode = setGridMode;
    this.grid$ = grid$;
    this.spotlight$ = spotlight$;
    this.pip$ = pip$;
    this.layout$ = layout$;
    this.tileStoreGeneration$ = tileStoreGeneration$;
    this.showSpotlightIndicators$ = showSpotlightIndicators$;
    this.showSpeakingIndicators$ = showSpeakingIndicators$;
    this.showHeader$ = showHeader$;
    this.showFooter$ = showFooter$;
    this.earpieceMode$ = earpieceMode$;
    this.audioOutputSwitcher$ = audioOutputSwitcher$;
    this.reconnecting$ = reconnecting$;
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
