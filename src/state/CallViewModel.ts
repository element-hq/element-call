/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  connectedParticipantsObserver,
  observeParticipantEvents,
  observeParticipantMedia,
} from "@livekit/components-core";
import {
  type Room as LivekitRoom,
  type LocalParticipant,
  LocalVideoTrack,
  ParticipantEvent,
  type RemoteParticipant,
  Track,
} from "livekit-client";
import {
  type Room as MatrixRoom,
  type RoomMember,
} from "matrix-js-sdk/src/matrix";
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
import { logger } from "matrix-js-sdk/src/logger";
import {
  type MatrixRTCSession,
  MatrixRTCSessionEvent,
} from "matrix-js-sdk/src/matrixrtc";

import { ViewModel } from "./ViewModel";
import {
  ECAddonConnectionState,
  type ECConnectionState,
} from "../livekit/useECConnectionState";
import {
  LocalUserMediaViewModel,
  type MediaViewModel,
  observeTrackReference$,
  RemoteUserMediaViewModel,
  ScreenShareViewModel,
  type UserMediaViewModel,
} from "./MediaViewModel";
import { accumulate, finalizeValue } from "../utils/observable";
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

  public readonly speaker$: Observable<boolean>;
  public readonly presenter$: Observable<boolean>;
  public constructor(
    public readonly id: string,
    member: RoomMember | undefined,
    participant: LocalParticipant | RemoteParticipant | undefined,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    handRaised$: Observable<Date | null>,
    reaction$: Observable<ReactionOption | null>,
  ) {
    this.participant$ = new BehaviorSubject(participant);

    if (participant?.isLocal) {
      this.vm = new LocalUserMediaViewModel(
        this.id,
        member,
        this.participant$.asObservable() as Observable<LocalParticipant>,
        encryptionSystem,
        livekitRoom,
        handRaised$,
        reaction$,
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
        handRaised$,
        reaction$,
      );
    }

    this.speaker$ = observeSpeaker$(this.vm.speaking$).pipe(this.scope.state());

    this.presenter$ = this.participant$.pipe(
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
      this.scope.state(),
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
  ) {
    this.participant$ = new BehaviorSubject(participant);

    this.vm = new ScreenShareViewModel(
      id,
      member,
      this.participant$.asObservable(),
      encryptionSystem,
      liveKitRoom,
      participant.isLocal,
    );
  }

  public destroy(): void {
    this.vm.destroy();
  }
}

type MediaItem = UserMedia | ScreenShare;

function findMatrixRoomMember(
  room: MatrixRoom,
  id: string,
): RoomMember | undefined {
  if (id === "local")
    return room.getMember(room.client.getUserId()!) ?? undefined;

  const parts = id.split(":");
  // must be at least 3 parts because we know the first part is a userId which must necessarily contain a colon
  if (parts.length < 3) {
    logger.warn(
      `Livekit participants ID (${id}) doesn't look like a userId:deviceId combination`,
    );
    return undefined;
  }

  parts.pop();
  const userId = parts.join(":");

  return room.getMember(userId) ?? undefined;
}

// TODO: Move wayyyy more business logic from the call and lobby views into here
export class CallViewModel extends ViewModel {
  public readonly localVideo$: Observable<LocalVideoTrack | null> =
    observeTrackReference$(
      of(this.livekitRoom.localParticipant),
      Track.Source.Camera,
    ).pipe(
      map((trackRef) => {
        const track = trackRef?.publication?.track;
        return track instanceof LocalVideoTrack ? track : null;
      }),
    );

  /**
   * The raw list of RemoteParticipants as reported by LiveKit
   */
  private readonly rawRemoteParticipants$: Observable<RemoteParticipant[]> =
    connectedParticipantsObserver(this.livekitRoom).pipe(this.scope.state());

  /**
   * Lists of RemoteParticipants to "hold" on display, even if LiveKit claims that
   * they've left
   */
  private readonly remoteParticipantHolds$: Observable<RemoteParticipant[][]> =
    this.connectionState$.pipe(
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
              this.connectionState$.pipe(
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
    );

  /**
   * The RemoteParticipants including those that are being "held" on the screen
   */
  private readonly remoteParticipants$: Observable<RemoteParticipant[]> =
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
    );

  /**
   * List of MediaItems that we want to display
   */
  private readonly mediaItems$: Observable<MediaItem[]> = combineLatest([
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
            // m.rtc.members are the basis for calculating what is visible in the call
            for (const rtcMember of this.matrixRTCSession.memberships) {
              const room = this.matrixRTCSession.room;
              // WARN! This is not exactly the sender but the user defined in the state key.
              // This will be available once we change to the new "member as object" format in the MatrixRTC object.
              let livekitParticipantId =
                rtcMember.sender + ":" + rtcMember.deviceId;

              const matrixIdentifier = `${rtcMember.sender}:${rtcMember.deviceId}`;

              let participant:
                | LocalParticipant
                | RemoteParticipant
                | undefined = undefined;
              if (
                rtcMember.sender === room.client.getUserId()! &&
                rtcMember.deviceId === room.client.getDeviceId()
              ) {
                livekitParticipantId = "local";
                participant = localParticipant;
              } else {
                participant = remoteParticipants.find(
                  (p) => p.identity === livekitParticipantId,
                );
              }

              const member = findMatrixRoomMember(room, livekitParticipantId);
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
                      this.encryptionSystem,
                      this.livekitRoom,
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
                        this.encryptionSystem,
                        this.livekitRoom,
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
                            this.encryptionSystem,
                            this.livekitRoom,
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

        for (const [id, t] of prevItems) if (!combinedNew.has(id)) t.destroy();
        return combinedNew;
      },
      new Map<string, MediaItem>(),
    ),
    map((mediaItems) => [...mediaItems.values()]),
    finalizeValue((ts) => {
      for (const t of ts) t.destroy();
    }),
    this.scope.state(),
  );

  /**
   * List of MediaItems that we want to display, that are of type UserMedia
   */
  private readonly userMedia$: Observable<UserMedia[]> = this.mediaItems$.pipe(
    map((mediaItems) =>
      mediaItems.filter((m): m is UserMedia => m instanceof UserMedia),
    ),
  );

  public readonly memberChanges$ = this.userMedia$
    .pipe(map((mediaItems) => mediaItems.map((m) => m.id)))
    .pipe(
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
   * List of MediaItems that we want to display, that are of type ScreenShare
   */
  private readonly screenShares$: Observable<ScreenShare[]> =
    this.mediaItems$.pipe(
      map((mediaItems) =>
        mediaItems.filter((m): m is ScreenShare => m instanceof ScreenShare),
      ),
      this.scope.state(),
    );

  private readonly spotlightSpeaker$: Observable<UserMediaViewModel | null> =
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
      this.scope.state(),
    );

  private readonly grid$: Observable<UserMediaViewModel[]> =
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
      this.scope.state(),
    );

  private readonly spotlight$: Observable<MediaViewModel[]> =
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
      this.scope.state(),
    );

  private readonly pip$: Observable<UserMediaViewModel | null> = combineLatest([
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
    this.scope.state(),
  );

  private readonly hasRemoteScreenShares$: Observable<boolean> =
    this.spotlight$.pipe(
      map((spotlight) =>
        spotlight.some((vm) => !vm.local && vm instanceof ScreenShareViewModel),
      ),
      distinctUntilChanged(),
    );

  private readonly pipEnabled$: Observable<boolean> = setPipEnabled$.pipe(
    startWith(false),
  );

  private readonly naturalWindowMode$: Observable<WindowMode> = fromEvent(
    window,
    "resize",
  ).pipe(
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
    this.scope.state(),
  );

  /**
   * The general shape of the window.
   */
  public readonly windowMode$: Observable<WindowMode> = this.pipEnabled$.pipe(
    switchMap((pip) => (pip ? of<WindowMode>("pip") : this.naturalWindowMode$)),
  );

  private readonly spotlightExpandedToggle$ = new Subject<void>();
  public readonly spotlightExpanded$: Observable<boolean> =
    this.spotlightExpandedToggle$.pipe(
      accumulate(false, (expanded) => !expanded),
      this.scope.state(),
    );

  private readonly gridModeUserSelection$ = new Subject<GridMode>();
  /**
   * The layout mode of the media tile grid.
   */
  public readonly gridMode$: Observable<GridMode> =
    // If the user hasn't selected spotlight and somebody starts screen sharing,
    // automatically switch to spotlight mode and reset when screen sharing ends
    this.gridModeUserSelection$.pipe(
      startWith(null),
      switchMap((userSelection) =>
        (userSelection === "spotlight"
          ? EMPTY
          : combineLatest([this.hasRemoteScreenShares$, this.windowMode$]).pipe(
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
      this.scope.state(),
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
  private readonly layoutMedia$: Observable<LayoutMedia> =
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
      this.scope.state(),
    );

  // There is a cyclical dependency here: the layout algorithms want to know
  // which tiles are on screen, but to know which tiles are on screen we have to
  // first render a layout. To deal with this we assume initially that no tiles
  // are visible, and loop the data back into the layouts with a Subject.
  private readonly visibleTiles$ = new Subject<number>();
  private readonly setVisibleTiles = (value: number): void =>
    this.visibleTiles$.next(value);

  public readonly layoutInternals$: Observable<
    LayoutScanState & { layout: Layout }
  > = combineLatest([
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
    this.scope.state(),
  );

  /**
   * The layout of tiles in the call interface.
   */
  public readonly layout$: Observable<Layout> = this.layoutInternals$.pipe(
    map(({ layout }) => layout),
    this.scope.state(),
  );

  /**
   * The current generation of the tile store, exposed for debugging purposes.
   */
  public readonly tileStoreGeneration$: Observable<number> =
    this.layoutInternals$.pipe(
      map(({ tiles }) => tiles.generation),
      this.scope.state(),
    );

  public showSpotlightIndicators$: Observable<boolean> = this.layout$.pipe(
    map((l) => l.type !== "grid"),
    this.scope.state(),
  );

  public showSpeakingIndicators$: Observable<boolean> = this.layout$.pipe(
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
    this.scope.state(),
  );

  public readonly toggleSpotlightExpanded$: Observable<(() => void) | null> =
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
      this.scope.state(),
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

  public readonly showHeader$: Observable<boolean> = this.windowMode$.pipe(
    map((mode) => mode !== "pip" && mode !== "flat"),
    this.scope.state(),
  );

  public readonly showFooter$: Observable<boolean> = this.windowMode$.pipe(
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
    this.scope.state(),
  );

  public readonly reactions$ = this.reactionsSubject$.pipe(
    map((v) =>
      Object.fromEntries(
        Object.entries(v).map(([a, { reactionOption }]) => [a, reactionOption]),
      ),
    ),
  );

  public readonly handsRaised$ = this.handsRaisedSubject$.pipe();

  /**
   * Emits an array of reactions that should be visible on the screen.
   */
  public readonly visibleReactions$ = showReactions.value$.pipe(
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
    private readonly livekitRoom: LivekitRoom,
    private readonly encryptionSystem: EncryptionSystem,
    private readonly connectionState$: Observable<ECConnectionState>,
    private readonly handsRaisedSubject$: Observable<
      Record<string, RaisedHandInfo>
    >,
    private readonly reactionsSubject$: Observable<
      Record<string, ReactionInfo>
    >,
  ) {
    super();
  }
}
