/*
Copyright 2023, 2024, 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  connectedParticipantsObserver,
  observeParticipantEvents,
  observeParticipantMedia,
} from "@livekit/components-core";
import {
  ConnectionState,
  type Room as LivekitRoom,
  type LocalParticipant,
  ParticipantEvent,
  type RemoteParticipant,
} from "livekit-client";
import {
  ClientEvent,
  RoomStateEvent,
  SyncState,
  type Room as MatrixRoom,
  type RoomMember,
} from "matrix-js-sdk";
import {
  BehaviorSubject,
  EMPTY,
  type Observable,
  Subject,
  combineLatest,
  concat,
  distinctUntilChanged,
  filter,
  forkJoin,
  fromEvent,
  map,
  merge,
  mergeMap,
  of,
  race,
  scan,
  skip,
  startWith,
  switchAll,
  switchMap,
  switchScan,
  take,
  timer,
  withLatestFrom,
} from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  type CallMembership,
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
  MembershipManagerEvent,
} from "matrix-js-sdk/lib/matrixrtc";

import { ViewModel } from "./ViewModel";
import {
  ECAddonConnectionState,
  type ECConnectionState,
} from "../livekit/useECConnectionState";
import {
  LocalUserMediaViewModel,
  type MediaViewModel,
  RemoteUserMediaViewModel,
  ScreenShareViewModel,
  type UserMediaViewModel,
} from "./MediaViewModel";
import { accumulate, and$, finalizeValue } from "../utils/observable";
import { ObservableScope } from "./ObservableScope";
import {
  duplicateTiles,
  playReactionsSound,
  showReactions,
  showNonMemberTiles,
} from "../settings/settings";
import { isFirefox } from "../Platform";
import { setPipEnabled$ } from "../controls";
import {
  type GridTileViewModel,
  type SpotlightTileViewModel,
} from "./TileViewModel";
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
import { observeSpeaker$ } from "./observeSpeaker";
import { shallowEquals } from "../utils/array";
import { calculateDisplayName, shouldDisambiguate } from "../utils/displayname";
import { type MediaDevices } from "./MediaDevices";
import { type Behavior } from "./Behavior";

export interface CallViewModelOptions {
  encryptionSystem: EncryptionSystem;
  autoLeaveWhenOthersLeft?: boolean;
}
// How long we wait after a focus switch before showing the real participant
// list again
const POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS = 3000;

// This is the number of participants that we think constitutes a "small" call
// on mobile. No spotlight tile should be shown below this threshold.
const smallMobileCallThreshold = 3;

// How long the footer should be shown for when hovering over or interacting
// with the interface
const showFooterMs = 4000;

export interface GridLayoutMedia {
  type: "grid";
  spotlight?: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightLandscapeLayoutMedia {
  type: "spotlight-landscape";
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightPortraitLayoutMedia {
  type: "spotlight-portrait";
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightExpandedLayoutMedia {
  type: "spotlight-expanded";
  spotlight: MediaViewModel[];
  pip?: UserMediaViewModel;
}

export interface OneOnOneLayoutMedia {
  type: "one-on-one";
  local: UserMediaViewModel;
  remote: UserMediaViewModel;
}

export interface PipLayoutMedia {
  type: "pip";
  spotlight: MediaViewModel[];
}

export type LayoutMedia =
  | GridLayoutMedia
  | SpotlightLandscapeLayoutMedia
  | SpotlightPortraitLayoutMedia
  | SpotlightExpandedLayoutMedia
  | OneOnOneLayoutMedia
  | PipLayoutMedia;

export interface GridLayout {
  type: "grid";
  spotlight?: SpotlightTileViewModel;
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightLandscapeLayout {
  type: "spotlight-landscape";
  spotlight: SpotlightTileViewModel;
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightPortraitLayout {
  type: "spotlight-portrait";
  spotlight: SpotlightTileViewModel;
  grid: GridTileViewModel[];
  setVisibleTiles: (value: number) => void;
}

export interface SpotlightExpandedLayout {
  type: "spotlight-expanded";
  spotlight: SpotlightTileViewModel;
  pip?: GridTileViewModel;
}

export interface OneOnOneLayout {
  type: "one-on-one";
  local: GridTileViewModel;
  remote: GridTileViewModel;
}

export interface PipLayout {
  type: "pip";
  spotlight: SpotlightTileViewModel;
}

/**
 * A layout defining the media tiles present on screen and their visual
 * arrangement.
 */
export type Layout =
  | GridLayout
  | SpotlightLandscapeLayout
  | SpotlightPortraitLayout
  | SpotlightExpandedLayout
  | OneOnOneLayout
  | PipLayout;

export type GridMode = "grid" | "spotlight";

export type WindowMode = "normal" | "narrow" | "flat" | "pip";

/**
 * Sorting bins defining the order in which media tiles appear in the layout.
 */
enum SortingBin {
  /**
   * Yourself, when the "always show self" option is on.
   */
  SelfAlwaysShown,
  /**
   * Participants that are sharing their screen.
   */
  Presenters,
  /**
   * Participants that have been speaking recently.
   */
  Speakers,
  /**
   * Participants that have their hand raised.
   */
  HandRaised,
  /**
   * Participants with video.
   */
  Video,
  /**
   * Participants not sharing any video.
   */
  NoVideo,
  /**
   * Yourself, when the "always show self" option is off.
   */
  SelfNotAlwaysShown,
}

interface LayoutScanState {
  layout: Layout | null;
  tiles: TileStore;
}

class UserMedia {
  private readonly scope = new ObservableScope();
  public readonly vm: UserMediaViewModel;
  private readonly participant$: BehaviorSubject<
    LocalParticipant | RemoteParticipant | undefined
  >;

  public readonly speaker$: Behavior<boolean>;
  public readonly presenter$: Behavior<boolean>;
  public constructor(
    public readonly id: string,
    member: RoomMember | undefined,
    participant: LocalParticipant | RemoteParticipant | undefined,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    mediaDevices: MediaDevices,
    displayname$: Observable<string>,
    handRaised$: Observable<Date | null>,
    reaction$: Observable<ReactionOption | null>,
  ) {
    this.participant$ = new BehaviorSubject(participant);

    if (participant?.isLocal) {
      this.vm = new LocalUserMediaViewModel(
        this.id,
        member,
        this.participant$ as Behavior<LocalParticipant>,
        encryptionSystem,
        livekitRoom,
        mediaDevices,
        this.scope.behavior(displayname$),
        this.scope.behavior(handRaised$),
        this.scope.behavior(reaction$),
      );
    } else {
      this.vm = new RemoteUserMediaViewModel(
        id,
        member,
        this.participant$.asObservable() as Observable<
          RemoteParticipant | undefined
        >,
        encryptionSystem,
        livekitRoom,
        this.scope.behavior(displayname$),
        this.scope.behavior(handRaised$),
        this.scope.behavior(reaction$),
      );
    }

    this.speaker$ = this.scope.behavior(observeSpeaker$(this.vm.speaking$));

    this.presenter$ = this.scope.behavior(
      this.participant$.pipe(
        switchMap(
          (p) =>
            (p &&
              observeParticipantEvents(
                p,
                ParticipantEvent.TrackPublished,
                ParticipantEvent.TrackUnpublished,
                ParticipantEvent.LocalTrackPublished,
                ParticipantEvent.LocalTrackUnpublished,
              ).pipe(map((p) => p.isScreenShareEnabled))) ??
            of(false),
        ),
      ),
    );
  }

  public updateParticipant(
    newParticipant: LocalParticipant | RemoteParticipant | undefined,
  ): void {
    if (this.participant$.value !== newParticipant) {
      // Update the BehaviourSubject in the UserMedia.
      this.participant$.next(newParticipant);
    }
  }

  public destroy(): void {
    this.scope.end();
    this.vm.destroy();
  }
}

class ScreenShare {
  private readonly scope = new ObservableScope();
  public readonly vm: ScreenShareViewModel;
  private readonly participant$: BehaviorSubject<
    LocalParticipant | RemoteParticipant
  >;

  public constructor(
    id: string,
    member: RoomMember | undefined,
    participant: LocalParticipant | RemoteParticipant,
    encryptionSystem: EncryptionSystem,
    liveKitRoom: LivekitRoom,
    displayName$: Observable<string>,
  ) {
    this.participant$ = new BehaviorSubject(participant);

    this.vm = new ScreenShareViewModel(
      id,
      member,
      this.participant$.asObservable(),
      encryptionSystem,
      liveKitRoom,
      this.scope.behavior(displayName$),
      participant.isLocal,
    );
  }

  public destroy(): void {
    this.scope.end();
    this.vm.destroy();
  }
}

type MediaItem = UserMedia | ScreenShare;

function getRoomMemberFromRtcMember(
  rtcMember: CallMembership,
  room: MatrixRoom,
): { id: string; member: RoomMember | undefined } {
  // WARN! This is not exactly the sender but the user defined in the state key.
  // This will be available once we change to the new "member as object" format in the MatrixRTC object.
  let id = rtcMember.sender + ":" + rtcMember.deviceId;

  if (!rtcMember.sender) {
    return { id, member: undefined };
  }
  if (
    rtcMember.sender === room.client.getUserId() &&
    rtcMember.deviceId === room.client.getDeviceId()
  ) {
    id = "local";
  }

  const member = room.getMember(rtcMember.sender) ?? undefined;
  return { id, member };
}

// TODO: Move wayyyy more business logic from the call and lobby views into here
export class CallViewModel extends ViewModel {
  private readonly userId = this.matrixRoom.client.getUserId();
  private readonly deviceId = this.matrixRoom.client.getDeviceId();

  /**
   * The raw list of RemoteParticipants as reported by LiveKit
   */
  private readonly rawRemoteParticipants$ = this.scope.behavior<
    RemoteParticipant[]
  >(connectedParticipantsObserver(this.livekitRoom), []);

  /**
   * Lists of RemoteParticipants to "hold" on display, even if LiveKit claims that
   * they've left
   */
  private readonly remoteParticipantHolds$ = this.scope.behavior<
    RemoteParticipant[][]
  >(
    this.livekitConnectionState$.pipe(
      withLatestFrom(this.rawRemoteParticipants$),
      mergeMap(([s, ps]) => {
        // Whenever we switch focuses, we should retain all the previous
        // participants for at least POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS ms to
        // give their clients time to switch over and avoid jarring layout shifts
        if (s === ECAddonConnectionState.ECSwitchingFocus) {
          return concat(
            // Hold these participants
            of({ hold: ps }),
            // Wait for time to pass and the connection state to have changed
            forkJoin([
              timer(POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS),
              this.livekitConnectionState$.pipe(
                filter((s) => s !== ECAddonConnectionState.ECSwitchingFocus),
                take(1),
              ),
              // Then unhold them
            ]).pipe(map(() => ({ unhold: ps }))),
          );
        } else {
          return EMPTY;
        }
      }),
      // Accumulate the hold instructions into a single list showing which
      // participants are being held
      accumulate([] as RemoteParticipant[][], (holds, instruction) =>
        "hold" in instruction
          ? [instruction.hold, ...holds]
          : holds.filter((h) => h !== instruction.unhold),
      ),
    ),
  );

  /**
   * The RemoteParticipants including those that are being "held" on the screen
   */
  private readonly remoteParticipants$ = this.scope.behavior<
    RemoteParticipant[]
  >(
    combineLatest(
      [this.rawRemoteParticipants$, this.remoteParticipantHolds$],
      (raw, holds) => {
        const result = [...raw];
        const resultIds = new Set(result.map((p) => p.identity));

        // Incorporate the held participants into the list
        for (const hold of holds) {
          for (const p of hold) {
            if (!resultIds.has(p.identity)) {
              result.push(p);
              resultIds.add(p.identity);
            }
          }
        }

        return result;
      },
    ),
  );

  private readonly memberships$: Observable<CallMembership[]> = merge(
    // Handle call membership changes.
    fromEvent(this.matrixRTCSession, MatrixRTCSessionEvent.MembershipsChanged),
    // Handle room membership changes (and displayname updates)
    fromEvent(this.matrixRoom, RoomStateEvent.Members),
  ).pipe(
    startWith(null),
    map(() => this.matrixRTCSession.memberships),
  );

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
      // We can see our own call membership
      this.memberships$.pipe(
        map((ms) =>
          ms.some(
            (m) => m.sender === this.userId && m.deviceId === this.deviceId,
          ),
        ),
      ),
      // Also watch out for warnings that we've likely hit a timeout and our
      // delayed leave event is being sent (this condition is here because it
      // provides an earlier warning than the sync loop timeout, and we wouldn't
      // see the actual leave event until we reconnect to the sync loop)
      (
        fromEvent(
          this.matrixRTCSession,
          MembershipManagerEvent.ProbablyLeft,
        ) as Observable<[SyncState]>
      ).pipe(
        startWith([false]),
        map(([probablyLeft]) => !probablyLeft),
      ),
    ),
  );

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
        ({ connectedPreviously, reconnecting }, connectedNow) => ({
          connectedPreviously: connectedPreviously || connectedNow,
          reconnecting: connectedPreviously && !connectedNow,
        }),
        { connectedPreviously: false, reconnecting: false },
      ),
      map(({ reconnecting }) => reconnecting),
    ),
  );

  /**
   * Displaynames for each member of the call. This will disambiguate
   * any displaynames that clashes with another member. Only members
   * joined to the call are considered here.
   */
  public readonly memberDisplaynames$ = this.memberships$.pipe(
    map((memberships) => {
      const displaynameMap = new Map<string, string>();
      const room = this.matrixRoom;

      // We only consider RTC members for disambiguation as they are the only visible members.
      for (const rtcMember of memberships) {
        const matrixIdentifier = `${rtcMember.sender}:${rtcMember.deviceId}`;
        const { member } = getRoomMemberFromRtcMember(rtcMember, room);
        if (!member) {
          logger.error("Could not find member for media id:", matrixIdentifier);
          continue;
        }
        const disambiguate = shouldDisambiguate(member, memberships, room);
        displaynameMap.set(
          matrixIdentifier,
          calculateDisplayName(member, disambiguate),
        );
      }
      return displaynameMap;
    }),
    // It turns out that doing the disambiguation above is rather expensive on Safari (10x slower
    // than on Chrome/Firefox). This means it is important that we multicast the result so that we
    // don't do this work more times than we need to. This is achieved by converting to a behavior:
  );

  public readonly handsRaised$ = this.scope.behavior(this.handsRaisedSubject$);

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
    ),
  );

  /**
   * List of MediaItems that we want to display
   */
  private readonly mediaItems$ = this.scope.behavior<MediaItem[]>(
    combineLatest([
      this.remoteParticipants$,
      observeParticipantMedia(this.livekitRoom.localParticipant),
      duplicateTiles.value$,
      // Also react to changes in the MatrixRTC session list.
      // The session list will also be update if a room membership changes.
      // No additional RoomState event listener needs to be set up.
      fromEvent(
        this.matrixRTCSession,
        MatrixRTCSessionEvent.MembershipsChanged,
      ).pipe(startWith(null)),
      showNonMemberTiles.value$,
    ]).pipe(
      scan(
        (
          prevItems,
          [
            remoteParticipants,
            { participant: localParticipant },
            duplicateTiles,
            _membershipsChanged,
            showNonMemberTiles,
          ],
        ) => {
          const newItems = new Map(
            function* (this: CallViewModel): Iterable<[string, MediaItem]> {
              const room = this.matrixRoom;
              // m.rtc.members are the basis for calculating what is visible in the call
              for (const rtcMember of this.matrixRTCSession.memberships) {
                const { member, id: livekitParticipantId } =
                  getRoomMemberFromRtcMember(rtcMember, room);
                const matrixIdentifier = `${rtcMember.sender}:${rtcMember.deviceId}`;

                let participant:
                  | LocalParticipant
                  | RemoteParticipant
                  | undefined = undefined;
                if (livekitParticipantId === "local") {
                  participant = localParticipant;
                } else {
                  participant = remoteParticipants.find(
                    (p) => p.identity === livekitParticipantId,
                  );
                }

                if (!member) {
                  logger.error(
                    "Could not find member for media id: ",
                    livekitParticipantId,
                  );
                }
                for (let i = 0; i < 1 + duplicateTiles; i++) {
                  const indexedMediaId = `${livekitParticipantId}:${i}`;
                  let prevMedia = prevItems.get(indexedMediaId);
                  if (prevMedia && prevMedia instanceof UserMedia) {
                    prevMedia.updateParticipant(participant);
                    if (prevMedia.vm.member === undefined) {
                      // We have a previous media created because of the `debugShowNonMember` flag.
                      // In this case we actually replace the media item.
                      // This "hack" never occurs if we do not use the `debugShowNonMember` debugging
                      // option and if we always find a room member for each rtc member (which also
                      // only fails if we have a fundamental problem)
                      prevMedia = undefined;
                    }
                  }
                  yield [
                    indexedMediaId,
                    // We create UserMedia with or without a participant.
                    // This will be the initial value of a BehaviourSubject.
                    // Once a participant appears we will update the BehaviourSubject. (see above)
                    prevMedia ??
                      new UserMedia(
                        indexedMediaId,
                        member,
                        participant,
                        this.options.encryptionSystem,
                        this.livekitRoom,
                        this.mediaDevices,
                        this.memberDisplaynames$.pipe(
                          map((m) => m.get(matrixIdentifier) ?? "[👻]"),
                        ),
                        this.handsRaised$.pipe(
                          map((v) => v[matrixIdentifier]?.time ?? null),
                        ),
                        this.reactions$.pipe(
                          map((v) => v[matrixIdentifier] ?? undefined),
                        ),
                      ),
                  ];

                  if (participant?.isScreenShareEnabled) {
                    const screenShareId = `${indexedMediaId}:screen-share`;
                    yield [
                      screenShareId,
                      prevItems.get(screenShareId) ??
                        new ScreenShare(
                          screenShareId,
                          member,
                          participant,
                          this.options.encryptionSystem,
                          this.livekitRoom,
                          this.memberDisplaynames$.pipe(
                            map((m) => m.get(matrixIdentifier) ?? "[👻]"),
                          ),
                        ),
                    ];
                  }
                }
              }
            }.bind(this)(),
          );

          // Generate non member items (items without a corresponding MatrixRTC member)
          // Those items should not be rendered, they are participants in LiveKit that do not have a corresponding
          // MatrixRTC members. This cannot be any good:
          //  - A malicious user impersonates someone
          //  - Someone injects abusive content
          //  - The user cannot have encryption keys so it makes no sense to participate
          // We can only trust users that have a MatrixRTC member event.
          //
          // This is still available as a debug option. This can be useful
          //  - If one wants to test scalability using the LiveKit CLI.
          //  - If an experimental project does not yet do the MatrixRTC bits.
          //  - If someone wants to debug if the LiveKit connection works but MatrixRTC room state failed to arrive.
          const newNonMemberItems = showNonMemberTiles
            ? new Map(
                function* (this: CallViewModel): Iterable<[string, MediaItem]> {
                  for (const participant of remoteParticipants) {
                    for (let i = 0; i < 1 + duplicateTiles; i++) {
                      const maybeNonMemberParticipantId =
                        participant.identity + ":" + i;
                      if (!newItems.has(maybeNonMemberParticipantId)) {
                        const nonMemberId = maybeNonMemberParticipantId;
                        yield [
                          nonMemberId,
                          prevItems.get(nonMemberId) ??
                            new UserMedia(
                              nonMemberId,
                              undefined,
                              participant,
                              this.options.encryptionSystem,
                              this.livekitRoom,
                              this.mediaDevices,
                              this.memberDisplaynames$.pipe(
                                map(
                                  (m) => m.get(participant.identity) ?? "[👻]",
                                ),
                              ),
                              of(null),
                              of(null),
                            ),
                        ];
                      }
                    }
                  }
                }.bind(this)(),
              )
            : new Map();
          if (newNonMemberItems.size > 0) {
            logger.debug("Added NonMember items: ", newNonMemberItems);
          }

          const combinedNew = new Map([
            ...newNonMemberItems.entries(),
            ...newItems.entries(),
          ]);

          for (const [id, t] of prevItems)
            if (!combinedNew.has(id)) t.destroy();
          return combinedNew;
        },
        new Map<string, MediaItem>(),
      ),
      map((mediaItems) => [...mediaItems.values()]),
      finalizeValue((ts) => {
        for (const t of ts) t.destroy();
      }),
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

  /**
   * This observable tracks the currently connected participants.
   *
   *  - Each participant has one livekit connection
   *  - Each participant has a corresponding MatrixRTC membership state event
   *  - There can be multiple participants for one matrix user.
   */
  public readonly participantChanges$ = this.userMedia$.pipe(
    map((mediaItems) => mediaItems.map((m) => m.id)),
    scan<string[], { ids: string[]; joined: string[]; left: string[] }>(
      (prev, ids) => {
        const left = prev.ids.filter((id) => !ids.includes(id));
        const joined = ids.filter((id) => !prev.ids.includes(id));
        return { ids, joined, left };
      },
      { ids: [], joined: [], left: [] },
    ),
  );

  /**
   * This observable tracks the matrix users that are currently in the call.
   * There can be just one matrix user with multiple participants (see also participantChanges$)
   */
  public readonly matrixUserChanges$ = this.userMedia$.pipe(
    map(
      (mediaItems) =>
        new Set(
          mediaItems
            .map((m) => m.vm.member?.userId)
            .filter((id) => id !== undefined),
        ),
    ),
    scan<
      Set<string>,
      {
        userIds: Set<string>;
        joinedUserIds: Set<string>;
        leftUserIds: Set<string>;
      }
    >(
      (prevState, userIds) => {
        const left = new Set(
          [...prevState.userIds].filter((id) => !userIds.has(id)),
        );
        const joined = new Set(
          [...userIds].filter((id) => !prevState.userIds.has(id)),
        );
        return { userIds: userIds, joinedUserIds: joined, leftUserIds: left };
      },
      { userIds: new Set(), joinedUserIds: new Set(), leftUserIds: new Set() },
    ),
  );

  public readonly allOthersLeft$ = this.matrixUserChanges$.pipe(
    map(({ userIds, leftUserIds }) => {
      if (!this.userId) {
        logger.warn("Could not access user ID to compute allOthersLeft");
        return false;
      }
      return (
        userIds.size === 1 && userIds.has(this.userId) && leftUserIds.size > 0
      );
    }),
    startWith(false),
    distinctUntilChanged(),
  );

  public readonly autoLeaveWhenOthersLeft$ = this.allOthersLeft$.pipe(
    distinctUntilChanged(),
    filter((leave) => (leave && this.options.autoLeaveWhenOthersLeft) ?? false),
    map(() => {}),
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
          combineLatest(
            [
              m.speaker$,
              m.presenter$,
              m.vm.videoEnabled$,
              m.vm.handRaised$,
              m.vm instanceof LocalUserMediaViewModel
                ? m.vm.alwaysShow$
                : of(false),
            ],
            (speaker, presenter, video, handRaised, alwaysShow) => {
              let bin: SortingBin;
              if (m.vm.local)
                bin = alwaysShow
                  ? SortingBin.SelfAlwaysShown
                  : SortingBin.SelfNotAlwaysShown;
              else if (presenter) bin = SortingBin.Presenters;
              else if (speaker) bin = SortingBin.Speakers;
              else if (handRaised) bin = SortingBin.HandRaised;
              else if (video) bin = SortingBin.Video;
              else bin = SortingBin.NoVideo;

              return [m, bin] as const;
            },
          ),
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
      distinctUntilChanged(shallowEquals),
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

  public constructor(
    // A call is permanently tied to a single Matrix room and LiveKit room
    private readonly matrixRTCSession: MatrixRTCSession,
    private readonly matrixRoom: MatrixRoom,
    private readonly livekitRoom: LivekitRoom,
    private readonly mediaDevices: MediaDevices,
    private readonly options: CallViewModelOptions,
    private readonly livekitConnectionState$: Observable<ECConnectionState>,
    private readonly handsRaisedSubject$: Observable<
      Record<string, RaisedHandInfo>
    >,
    private readonly reactionsSubject$: Observable<
      Record<string, ReactionInfo>
    >,
  ) {
    super();

    // Pause all media tracks when we're disconnected from MatrixRTC, because it
    // can be an unpleasant surprise for the app to say 'reconnecting' and yet
    // still be transmitting your media to others.
    this.matrixConnected$.pipe(this.scope.bind()).subscribe((connected) => {
      const publications =
        this.livekitRoom.localParticipant.trackPublications.values();
      if (connected) {
        for (const p of publications) {
          if (p.track?.isUpstreamPaused === true) {
            const kind = p.track.kind;
            logger.log(`Reconnected to MatrixRTC; resuming ${kind} track`);
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
            logger.log(`Lost connection to MatrixRTC; pausing ${kind} track`);
            p.track
              .pauseUpstream()
              .catch((e) =>
                logger.error(
                  `Failed to pause ${kind} track after MatrixRTC connection loss`,
                  e,
                ),
              );
          }
        }
      }
    });
  }
}
