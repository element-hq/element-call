/*
Copyright 2023-2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {
  connectedParticipantsObserver,
  observeParticipantEvents,
  observeParticipantMedia,
} from "@livekit/components-core";
import {
  Room as LivekitRoom,
  LocalParticipant,
  ParticipantEvent,
  RemoteParticipant,
} from "livekit-client";
import { Room as MatrixRoom, RoomMember } from "matrix-js-sdk/src/matrix";
import { useEffect, useRef } from "react";
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  audit,
  combineLatest,
  concat,
  distinctUntilChanged,
  filter,
  map,
  merge,
  mergeAll,
  of,
  sample,
  scan,
  shareReplay,
  startWith,
  switchAll,
  switchMap,
  throttleTime,
  timer,
  zip,
} from "rxjs";
import { StateObservable, state } from "@react-rxjs/core";
import { logger } from "matrix-js-sdk/src/logger";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { CallMembership } from "matrix-js-sdk/src/matrixrtc/CallMembership";

import { ViewModel } from "./ViewModel";
import { useObservable } from "./useObservable";
import {
  ECAddonConnectionState,
  ECConnectionState,
} from "../livekit/useECConnectionState";
import { usePrevious } from "../usePrevious";
import {
  MediaViewModel,
  UserMediaViewModel,
  ScreenShareViewModel,
  MembershipOnlyViewModel,
} from "./MediaViewModel";
import { finalizeValue } from "../observable-utils";
import { ObservableScope } from "./ObservableScope";

// How long we wait after a focus switch before showing the real participant
// list again
const POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS = 3000;

// Represents something that should get a tile on the layout,
// ie. a user's video feed or a screen share feed.
// TODO: This exposes too much information to the view layer, let's keep this
// information internal to the view model and switch to using Tile<T> instead
export interface TileDescriptor<T> {
  id: string;
  focused: boolean;
  isPresenter: boolean;
  isSpeaker: boolean;
  hasVideo: boolean;
  local: boolean;
  largeBaseSize: boolean;
  placeNear?: string;
  data: T;
}

export interface GridLayout {
  type: "grid";
  spotlight?: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightLayout {
  type: "spotlight";
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface FullScreenLayout {
  type: "full screen";
  spotlight: MediaViewModel[];
  pip?: UserMediaViewModel;
}

export interface PipLayout {
  type: "pip";
  spotlight: MediaViewModel[];
}

/**
 * A layout defining the media tiles present on screen and their visual
 * arrangement.
 */
export type Layout =
  | GridLayout
  | SpotlightLayout
  | FullScreenLayout
  | PipLayout;

export type GridMode = "grid" | "spotlight";

export type WindowMode = "normal" | "full screen" | "pip";

/**
 * Sorting bins defining the order in which media tiles appear in the layout.
 */
enum SortingBin {
  SelfStart,
  Presenters,
  Speakers,
  VideoAndAudio,
  Video,
  Audio,
  NoMedia,
  SelfEnd,
}

class UserMedia {
  private readonly scope = new ObservableScope();
  public readonly vm: UserMediaViewModel;
  public readonly speaker: Observable<boolean>;
  public readonly presenter: Observable<boolean>;

  public constructor(
    public readonly id: string,
    member: RoomMember | undefined,
    participant: LocalParticipant | RemoteParticipant,
    callEncrypted: boolean,
  ) {
    this.vm = new UserMediaViewModel(id, member, participant, callEncrypted);

    this.speaker = this.vm.speaking.pipeState(
      // Require 1 s of continuous speaking to become a speaker, and 10 s of
      // continuous silence to stop being considered a speaker
      audit((s) =>
        merge(
          timer(s ? 1000 : 10000),
          // If the speaking flag resets to its original value during this time,
          // end the silencing window to stick with that original value
          this.vm.speaking.pipe(filter((s1) => s1 !== s)),
        ),
      ),
      startWith(false),
      distinctUntilChanged(),
      this.scope.bind(),
      // Make this Observable hot so that the timers don't reset when you
      // resubscribe
      shareReplay(1),
    );

    this.presenter = observeParticipantEvents(
      participant,
      ParticipantEvent.TrackPublished,
      ParticipantEvent.TrackUnpublished,
      ParticipantEvent.LocalTrackPublished,
      ParticipantEvent.LocalTrackUnpublished,
    ).pipe(map((p) => p.isScreenShareEnabled));
  }

  public destroy(): void {
    this.scope.end();
    this.vm.destroy();
  }
}

class ScreenShare {
  public readonly vm: ScreenShareViewModel;

  public constructor(
    id: string,
    member: RoomMember | undefined,
    participant: LocalParticipant | RemoteParticipant,
    callEncrypted: boolean,
  ) {
    this.vm = new ScreenShareViewModel(id, member, participant, callEncrypted);
  }

  public destroy(): void {
    this.vm.destroy();
  }
}

class MembershipOnly {
  public readonly vm: MembershipOnlyViewModel;

  public constructor(member: RoomMember) {
    this.vm = new MembershipOnlyViewModel(member);
  }

  public destroy(): void {
    this.vm.destroy();
  }
}

type MediaItem = UserMedia | ScreenShare | MembershipOnly;

function matrixUserIdFromParticipantId(id: string): string | undefined {
  if (!id) return undefined;
  const parts = id.split(":");
  // must be at least 3 parts because we know the first part is a userId which must necessarily contain a colon
  if (parts.length < 3) {
    logger.warn(
      `Livekit participants ID doesn't look like a userId:deviceId combination: ${id}`,
    );
    return undefined;
  }

  parts.pop();
  const userId = parts.join(":");
  return userId;
}

function findMatrixMember(
  room: MatrixRoom,
  id: string,
): RoomMember | undefined {
  const userId = matrixUserIdFromParticipantId(id);

  if (!userId) {
    return undefined;
  }

  return room.getMember(userId) ?? undefined;
}

// TODO: Move wayyyy more business logic from the call and lobby views into here
export class CallViewModel extends ViewModel {
  private readonly rawRemoteParticipants = state(
    connectedParticipantsObserver(this.livekitRoom),
  );

  // Lists of participants to "hold" on display, even if LiveKit claims that
  // they've left
  private readonly remoteParticipantHolds: Observable<RemoteParticipant[][]> =
    zip(
      this.connectionState,
      this.rawRemoteParticipants.pipe(sample(this.connectionState)),
      (s, ps) => {
        // Whenever we switch focuses, we should retain all the previous
        // participants for at least POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS ms to
        // give their clients time to switch over and avoid jarring layout shifts
        if (s === ECAddonConnectionState.ECSwitchingFocus) {
          return concat(
            // Hold these participants
            of({ hold: ps }),
            // Wait for time to pass and the connection state to have changed
            Promise.all([
              new Promise<void>((resolve) =>
                setTimeout(resolve, POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS),
              ),
              new Promise<void>((resolve) => {
                const subscription = this.connectionState
                  .pipe(this.scope.bind())
                  .subscribe((s) => {
                    if (s !== ECAddonConnectionState.ECSwitchingFocus) {
                      resolve();
                      subscription.unsubscribe();
                    }
                  });
              }),
              // Then unhold them
            ]).then(() => Promise.resolve({ unhold: ps })),
          );
        } else {
          return EMPTY;
        }
      },
    ).pipe(
      mergeAll(),
      // Aggregate the hold instructions into a single list showing which
      // participants are being held
      scan(
        (holds, instruction) =>
          "hold" in instruction
            ? [instruction.hold, ...holds]
            : holds.filter((h) => h !== instruction.unhold),
        [] as RemoteParticipant[][],
      ),
      startWith([]),
    );

  private readonly remoteParticipants: Observable<RemoteParticipant[]> =
    combineLatest(
      [this.rawRemoteParticipants, this.remoteParticipantHolds],
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

  private readonly membershipsWithoutParticipant = combineLatest([
    of(this.rtcSession.memberships),
    this.remoteParticipants,
    of(this.livekitRoom.localParticipant),
  ]).pipe(
    scan((prev, [memberships, remoteParticipants, localParticipant]) => {
      const participantIds = new Set(
        remoteParticipants.map((p) =>
          matrixUserIdFromParticipantId(p.identity),
        ),
      );
      participantIds.add(
        matrixUserIdFromParticipantId(localParticipant.identity),
      );
      return memberships.filter((m) => !participantIds.has(m.sender ?? ""));
    }, [] as CallMembership[]),
  );

  private readonly mediaItems: StateObservable<MediaItem[]> = state(
    combineLatest([
      this.remoteParticipants,
      observeParticipantMedia(this.livekitRoom.localParticipant),
    ]).pipe(
      scan(
        (
          prevItems,
          [remoteParticipants, { participant: localParticipant }],
        ) => {
          let allGhosts = true;

          const newItems = new Map(
            function* (this: CallViewModel): Iterable<[string, MediaItem]> {
              for (const p of [localParticipant, ...remoteParticipants]) {
                const member = findMatrixMember(this.matrixRoom, p.identity);
                allGhosts &&= member === undefined;
                // We always start with a local participant with the empty string as
                // their ID before we're connected, this is fine and we'll be in
                // "all ghosts" mode.
                if (p.identity !== "" && member === undefined) {
                  logger.warn(
                    `Ruh, roh! No matrix member found for SFU participant '${p.identity}': creating g-g-g-ghost!`,
                  );
                }

                const userMediaId = p.identity;
                yield [
                  userMediaId,
                  prevItems.get(userMediaId) ??
                    new UserMedia(userMediaId, member, p, this.encrypted),
                ];

                if (p.isScreenShareEnabled) {
                  const screenShareId = `${userMediaId}:screen-share`;
                  yield [
                    screenShareId,
                    prevItems.get(screenShareId) ??
                      new ScreenShare(screenShareId, member, p, this.encrypted),
                  ];
                }
              }
            }.bind(this)(),
          );

          for (const [id, t] of prevItems) if (!newItems.has(id)) t.destroy();

          // If every item is a ghost, that probably means we're still connecting
          // and shouldn't bother showing anything yet
          return allGhosts ? new Map() : newItems;
        },
        new Map<string, MediaItem>(),
      ),
      map((ms) => [...ms.values()]),
      finalizeValue((ts) => {
        for (const t of ts) t.destroy();
      }),
    ),
  );

  private readonly userMedia: Observable<UserMedia[]> = this.mediaItems.pipe(
    map((ms) => ms.filter((m): m is UserMedia => m instanceof UserMedia)),
  );

  private readonly screenShares: Observable<ScreenShare[]> =
    this.mediaItems.pipe(
      map((ms) => ms.filter((m): m is ScreenShare => m instanceof ScreenShare)),
    );

  private readonly spotlightSpeaker: Observable<UserMedia | null> =
    this.userMedia.pipe(
      switchMap((ms) =>
        ms.length === 0
          ? of([])
          : combineLatest(
              ms.map((m) => m.vm.speaking.pipe(map((s) => [m, s] as const))),
            ),
      ),
      scan<(readonly [UserMedia, boolean])[], UserMedia | null, null>(
        (prev, ms) =>
          // Decide who to spotlight:
          // If the previous speaker is still speaking, stick with them rather
          // than switching eagerly to someone else
          ms.find(([m, s]) => m === prev && s)?.[0] ??
          // Otherwise, select anyone who is speaking
          ms.find(([, s]) => s)?.[0] ??
          // Otherwise, stick with the person who was last speaking
          prev ??
          // Otherwise, spotlight the local user
          ms.find(([m]) => m.vm.local)?.[0] ??
          null,
        null,
      ),
      distinctUntilChanged(),
      throttleTime(800, undefined, { leading: true, trailing: true }),
    );

  private readonly grid: Observable<UserMediaViewModel[]> = this.userMedia.pipe(
    switchMap((ms) => {
      const bins = ms.map((m) =>
        combineLatest(
          [m.speaker, m.presenter, m.vm.audioEnabled, m.vm.videoEnabled],
          (speaker, presenter, audio, video) => {
            let bin: SortingBin;
            if (m.vm.local) bin = SortingBin.SelfStart;
            else if (presenter) bin = SortingBin.Presenters;
            else if (speaker) bin = SortingBin.Speakers;
            else if (video)
              bin = audio ? SortingBin.VideoAndAudio : SortingBin.Video;
            else bin = audio ? SortingBin.Audio : SortingBin.NoMedia;

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
  );

  private readonly spotlight: Observable<MediaViewModel[]> = combineLatest(
    [this.screenShares, this.spotlightSpeaker],
    (screenShares, spotlightSpeaker): MediaViewModel[] =>
      screenShares.length > 0
        ? screenShares.map((m) => m.vm)
        : spotlightSpeaker === null
          ? []
          : [spotlightSpeaker.vm],
  );

  // TODO: Make this react to changes in window dimensions and screen
  // orientation
  private readonly windowMode = of<WindowMode>("normal");

  private readonly _gridMode = new BehaviorSubject<GridMode>("grid");
  /**
   * The layout mode of the media tile grid.
   */
  public readonly gridMode = state(this._gridMode);

  public setGridMode(value: GridMode): void {
    this._gridMode.next(value);
  }

  public readonly layout: StateObservable<Layout> = state(
    combineLatest([this._gridMode, this.windowMode], (gridMode, windowMode) => {
      switch (windowMode) {
        case "full screen":
          throw new Error("unimplemented");
        case "pip":
          throw new Error("unimplemented");
        case "normal": {
          switch (gridMode) {
            case "grid":
              return combineLatest(
                [this.grid, this.spotlight, this.screenShares],
                (grid, spotlight, screenShares): Layout => ({
                  type: "grid",
                  spotlight: screenShares.length > 0 ? spotlight : undefined,
                  grid,
                }),
              );
            case "spotlight":
              return combineLatest(
                [this.grid, this.spotlight],
                (grid, spotlight): Layout => ({
                  type: "spotlight",
                  spotlight,
                  grid,
                }),
              );
          }
        }
      }
    }).pipe(switchAll()),
  );

  /**
   * The media tiles to be displayed in the call view.
   */
  // TODO: Get rid of this field, replacing it with the 'layout' field above
  // which keeps more details of the layout order internal to the view model
  public readonly tiles: StateObservable<TileDescriptor<MediaViewModel>[]> =
    state(
      combineLatest([
        this.remoteParticipants,
        observeParticipantMedia(this.livekitRoom.localParticipant),
        this.membershipsWithoutParticipant,
      ]).pipe(
        scan(
          (
            ts,
            [
              remoteParticipants,
              { participant: localParticipant },
              membershipsWithoutParticipant,
            ],
          ) => {
            const ps = [
              localParticipant,
              ...remoteParticipants,
              ...membershipsWithoutParticipant,
            ];
            const tilesById = new Map(ts.map((t) => [t.id, t]));
            const now = Date.now();
            let allGhosts = true;

            const newTiles = ps.flatMap((p) => {
              if (p instanceof CallMembership) {
                const userId = p.sender ?? "";
                const member = this.matrixRoom.getMember(userId);
                if (!member) {
                  logger.warn(
                    `Ruh, roh! No matrix member found for call membership '${userId}': ignoring`,
                  );
                  return [];
                }
                const membershipOnlyVm =
                  tilesById.get(userId)?.data ??
                  new MembershipOnlyViewModel(member);
                tilesById.delete(userId);

                const membershipOnlyTile: TileDescriptor<MediaViewModel> = {
                  id: userId,
                  focused: false,
                  isPresenter: false,
                  isSpeaker: false,
                  hasVideo: false,
                  local: false,
                  largeBaseSize: false,
                  data: membershipOnlyVm,
                };
                return [membershipOnlyTile];
              }

              const userMediaId = p.identity;
              const member = findMatrixMember(this.matrixRoom, userMediaId);
              allGhosts &&= member === undefined;
              const spokeRecently =
                p.lastSpokeAt !== undefined && now - +p.lastSpokeAt <= 10000;

              // We always start with a local participant with the empty string as
              // their ID before we're connected, this is fine and we'll be in
              // "all ghosts" mode.
              if (userMediaId !== "" && member === undefined) {
                logger.warn(
                  `Ruh, roh! No matrix member found for SFU participant '${userMediaId}': creating g-g-g-ghost!`,
                );
              }

              const userMediaVm =
                tilesById.get(userMediaId)?.data ??
                new UserMediaViewModel(userMediaId, member, p, this.encrypted);
              tilesById.delete(userMediaId);

              const userMediaTile: TileDescriptor<MediaViewModel> = {
                id: userMediaId,
                focused: false,
                isPresenter: p.isScreenShareEnabled,
                isSpeaker: (p.isSpeaking || spokeRecently) && !p.isLocal,
                hasVideo: p.isCameraEnabled,
                local: p.isLocal,
                largeBaseSize: false,
                data: userMediaVm,
              };

              if (p.isScreenShareEnabled) {
                const screenShareId = `${userMediaId}:screen-share`;
                const screenShareVm =
                  tilesById.get(screenShareId)?.data ??
                  new ScreenShareViewModel(
                    screenShareId,
                    member,
                    p,
                    this.encrypted,
                  );
                tilesById.delete(screenShareId);

                const screenShareTile: TileDescriptor<MediaViewModel> = {
                  id: screenShareId,
                  focused: true,
                  isPresenter: false,
                  isSpeaker: false,
                  hasVideo: true,
                  local: p.isLocal,
                  largeBaseSize: true,
                  placeNear: userMediaId,
                  data: screenShareVm,
                };
                return [userMediaTile, screenShareTile];
              } else {
                return [userMediaTile];
              }
            });

            // Any tiles left in the map are unused and should be destroyed
            for (const t of tilesById.values()) t.data.destroy();

            // If every item is a ghost, that probably means we're still connecting
            // and shouldn't bother showing anything yet
            return allGhosts ? [] : newTiles;
          },
          [] as TileDescriptor<MediaViewModel>[],
        ),
        finalizeValue((ts) => {
          for (const t of ts) t.data.destroy();
        }),
      ),
    );

  private get matrixRoom(): MatrixRoom {
    return this.rtcSession.room;
  }

  public constructor(
    // A call is permanently tied to a single Matrix room and LiveKit room
    private readonly rtcSession: MatrixRTCSession,
    private readonly livekitRoom: LivekitRoom,
    private readonly encrypted: boolean,
    private readonly connectionState: Observable<ECConnectionState>,
  ) {
    super();
  }
}

export function useCallViewModel(
  rtcSession: MatrixRTCSession,
  livekitRoom: LivekitRoom,
  encrypted: boolean,
  connectionState: ECConnectionState,
): CallViewModel {
  const prevRTCSession = usePrevious(rtcSession);
  const prevLivekitRoom = usePrevious(livekitRoom);
  const prevEncrypted = usePrevious(encrypted);
  const connectionStateObservable = useObservable(connectionState);

  const vm = useRef<CallViewModel>();
  if (
    rtcSession !== prevRTCSession ||
    livekitRoom !== prevLivekitRoom ||
    encrypted !== prevEncrypted
  ) {
    vm.current?.destroy();
    vm.current = new CallViewModel(
      rtcSession,
      livekitRoom,
      encrypted,
      connectionStateObservable,
    );
  }

  useEffect(() => vm.current?.destroy(), []);

  return vm.current!;
}
