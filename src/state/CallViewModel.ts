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
  EMPTY,
  Observable,
  Subject,
  audit,
  combineLatest,
  concat,
  distinctUntilChanged,
  filter,
  fromEvent,
  map,
  merge,
  mergeAll,
  of,
  sample,
  scan,
  shareReplay,
  skip,
  startWith,
  switchMap,
  throttleTime,
  timer,
  zip,
} from "rxjs";
import { logger } from "matrix-js-sdk/src/logger";
import { MatrixRTCSession, CallMembership } from "matrix-js-sdk/src/matrixrtc";

import { ViewModel } from "./ViewModel";
import { useObservable } from "./useObservable";
import {
  ECAddonConnectionState,
  ECConnectionState,
} from "../livekit/useECConnectionState";
import { usePrevious } from "../usePrevious";
import {
  LocalUserMediaViewModel,
  MediaViewModel,
  MembershipOnlyViewModel,
  RemoteUserMediaViewModel,
  ScreenShareViewModel,
  UserMediaViewModel,
} from "./MediaViewModel";
import { accumulate, finalizeValue } from "../observable-utils";
import { ObservableScope } from "./ObservableScope";
import { duplicateTiles } from "../settings/settings";

// How long we wait after a focus switch before showing the real participant
// list again
const POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS = 3000;

export interface GridLayout {
  type: "grid";
  spotlight?: MediaViewModel[];
  grid: MediaViewModel[];
}

export interface SpotlightLandscapeLayout {
  type: "spotlight-landscape";
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightPortraitLayout {
  type: "spotlight-portrait";
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
}

export interface SpotlightExpandedLayout {
  type: "spotlight-expanded";
  spotlight: MediaViewModel[];
  pip?: UserMediaViewModel;
}

export interface OneOnOneLayout {
  type: "one-on-one";
  local: LocalUserMediaViewModel;
  remote: UserMediaViewModel;
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

class UserMedia {
  private readonly scope = new ObservableScope();
  public readonly vm: UserMediaViewModel;
  public readonly speaker: Observable<boolean>;
  public readonly presenter: Observable<boolean>;

  public constructor(
    id: string,
    member: RoomMember | undefined,
    participant: LocalParticipant | RemoteParticipant,
    callEncrypted: boolean,
  );
  public constructor(
    id: string,
    member: RoomMember | undefined,
    callMembership: CallMembership,
  );
  public constructor(
    public readonly id: string,
    public readonly member: RoomMember | undefined,
    participant: LocalParticipant | RemoteParticipant | CallMembership,
    callEncrypted: boolean = false,
  ) {
    if (participant instanceof CallMembership) {
      this.vm = new MembershipOnlyViewModel(participant, member);
    } else {
      this.vm =
        participant instanceof LocalParticipant
          ? new LocalUserMediaViewModel(id, member, participant, callEncrypted)
          : new RemoteUserMediaViewModel(
              id,
              member,
              participant,
              callEncrypted,
            );
    }

    this.speaker = this.vm.speaking.pipe(
      // Require 1 s of continuous speaking to become a speaker, and 60 s of
      // continuous silence to stop being considered a speaker
      audit((s) =>
        merge(
          timer(s ? 1000 : 60000),
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

    if (participant instanceof CallMembership) {
      this.presenter = of(false);
    } else {
      this.presenter = observeParticipantEvents(
        participant,
        ParticipantEvent.TrackPublished,
        ParticipantEvent.TrackUnpublished,
        ParticipantEvent.LocalTrackPublished,
        ParticipantEvent.LocalTrackUnpublished,
      ).pipe(map((p) => p.isScreenShareEnabled));
    }
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
    livekitRoom: LivekitRoom,
  ) {
    this.vm = new ScreenShareViewModel(
      id,
      member,
      participant,
      callEncrypted,
      livekitRoom,
    );
  }

  public destroy(): void {
    this.vm.destroy();
  }
}

type MediaItem = UserMedia | ScreenShare;

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
  if (id === "local")
    return room.getMember(room.client.getUserId()!) ?? undefined;

  const userId = matrixUserIdFromParticipantId(id);

  if (!userId) {
    return undefined;
  }

  return room.getMember(userId) ?? undefined;
}

// TODO: Move wayyyy more business logic from the call and lobby views into here
export class CallViewModel extends ViewModel {
  private readonly rawRemoteParticipants = connectedParticipantsObserver(
    this.livekitRoom,
  ).pipe(shareReplay(1));

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
      // Accumulate the hold instructions into a single list showing which
      // participants are being held
      accumulate([] as RemoteParticipant[][], (holds, instruction) =>
        "hold" in instruction
          ? [instruction.hold, ...holds]
          : holds.filter((h) => h !== instruction.unhold),
      ),
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

  private readonly mediaItems: Observable<MediaItem[]> = combineLatest([
    this.remoteParticipants,
    observeParticipantMedia(this.livekitRoom.localParticipant),
    duplicateTiles.value,
    this.membershipsWithoutParticipant,
  ]).pipe(
    scan(
      (
        prevItems,
        [
          remoteParticipants,
          { participant: localParticipant },
          duplicateTiles,
          membershipsWithoutParticipant,
        ],
      ) => {
        const newItems = new Map(
          function* (this: CallViewModel): Iterable<[string, MediaItem]> {
            for (const p of [
              localParticipant,
              ...remoteParticipants,
              ...membershipsWithoutParticipant,
            ]) {
              if (p instanceof CallMembership) {
                const member =
                  this.matrixRoom.getMember(p.sender!) ?? undefined;
                yield [
                  p.sender!,
                  prevItems.get(p.sender!) ??
                    new UserMedia(p.sender!, member, p),
                ];
              } else {
                const member = findMatrixMember(
                  this.matrixRoom,
                  p === localParticipant ? "local" : p.identity,
                );
                if (member === undefined)
                  logger.warn(
                    `Ruh, roh! No matrix member found for SFU participant '${p.identity}': creating g-g-g-ghost!`,
                  );

                // Create as many tiles for this participant as called for by
                // the duplicateTiles option
                for (let i = 0; i < 1; i++) {
                  const userMediaId = `${p.identity}:${i}`;
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
                        new ScreenShare(
                          screenShareId,
                          member,
                          p,
                          this.encrypted,
                          this.livekitRoom,
                        ),
                    ];
                  }
                }
              }
            }
          }.bind(this)(),
        );

        for (const [id, t] of prevItems) if (!newItems.has(id)) t.destroy();
        return newItems;
      },
      new Map<string, MediaItem>(),
    ),
    map((mediaItems) => [...mediaItems.values()]),
    finalizeValue((ts) => {
      for (const t of ts) t.destroy();
    }),
    shareReplay(1),
  );

  private readonly userMedia: Observable<UserMedia[]> = this.mediaItems.pipe(
    map((mediaItems) =>
      mediaItems.filter((m): m is UserMedia => m instanceof UserMedia),
    ),
  );

  private readonly localUserMedia: Observable<LocalUserMediaViewModel> =
    this.mediaItems.pipe(
      map((ms) => ms.find((m) => m.vm.local)!.vm as LocalUserMediaViewModel),
    );

  private readonly screenShares: Observable<ScreenShare[]> =
    this.mediaItems.pipe(
      map((mediaItems) =>
        mediaItems.filter((m): m is ScreenShare => m instanceof ScreenShare),
      ),
      shareReplay(1),
    );

  private readonly hasRemoteScreenShares: Observable<boolean> =
    this.screenShares.pipe(
      map((ms) => ms.some((m) => !m.vm.local)),
      distinctUntilChanged(),
    );

  private readonly spotlightSpeaker: Observable<UserMediaViewModel> =
    this.userMedia.pipe(
      switchMap((mediaItems) =>
        mediaItems.length === 0
          ? of([])
          : combineLatest(
              mediaItems.map((m) =>
                m.vm.speaking.pipe(map((s) => [m, s] as const)),
              ),
            ),
      ),
      scan<(readonly [UserMedia, boolean])[], UserMedia, null>(
        (prev, mediaItems) => {
          const stickyPrev = prev === null || prev.vm.local ? null : prev;
          // Decide who to spotlight:
          // If the previous speaker (not the local user) is still speaking,
          // stick with them rather than switching eagerly to someone else
          return (
            mediaItems.find(([m, s]) => m === stickyPrev && s)?.[0] ??
            // Otherwise, select any remote user who is speaking
            mediaItems.find(([m, s]) => !m.vm.local && s)?.[0] ??
            // Otherwise, stick with the person who was last speaking
            stickyPrev ??
            // Otherwise, spotlight an arbitrary remote user
            mediaItems.find(([m]) => !m.vm.local)?.[0] ??
            // Otherwise, spotlight the local user
            mediaItems.find(([m]) => m.vm.local)![0]
          );
        },
        null,
      ),
      distinctUntilChanged(),
      map((speaker) => speaker.vm),
      shareReplay(1),
      throttleTime(1600, undefined, { leading: true, trailing: true }),
    );

  private readonly grid: Observable<UserMediaViewModel[]> = this.userMedia.pipe(
    switchMap((mediaItems) => {
      const bins = mediaItems.map((m) =>
        combineLatest(
          [
            m.speaker,
            m.presenter,
            m.vm.videoEnabled,
            m.vm instanceof LocalUserMediaViewModel
              ? m.vm.alwaysShow
              : of(false),
          ],
          (speaker, presenter, video, alwaysShow) => {
            let bin: SortingBin;
            if (m.vm.local)
              bin = alwaysShow
                ? SortingBin.SelfAlwaysShown
                : SortingBin.SelfNotAlwaysShown;
            else if (presenter) bin = SortingBin.Presenters;
            else if (speaker) bin = SortingBin.Speakers;
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
  );

  private readonly spotlightAndPip: Observable<
    [Observable<MediaViewModel[]>, Observable<UserMediaViewModel | null>]
  > = this.screenShares.pipe(
    map((screenShares) =>
      screenShares.length > 0
        ? ([of(screenShares.map((m) => m.vm)), this.spotlightSpeaker] as const)
        : ([
            this.spotlightSpeaker.pipe(map((speaker) => [speaker!])),
            this.localUserMedia.pipe(
              switchMap((vm) =>
                vm.alwaysShow.pipe(
                  map((alwaysShow) => (alwaysShow ? vm : null)),
                ),
              ),
            ),
          ] as const),
    ),
  );

  private readonly spotlight: Observable<MediaViewModel[]> =
    this.spotlightAndPip.pipe(
      switchMap(([spotlight]) => spotlight),
      shareReplay(1),
    );

  private readonly pip: Observable<UserMediaViewModel | null> =
    this.spotlightAndPip.pipe(switchMap(([, pip]) => pip));

  /**
   * The general shape of the window.
   */
  public readonly windowMode: Observable<WindowMode> = fromEvent(
    window,
    "resize",
  ).pipe(
    startWith(null),
    map(() => {
      const height = window.innerHeight;
      const width = window.innerWidth;
      if (height <= 400 && width <= 340) return "pip";
      if (width <= 660) return "narrow";
      if (height <= 660) return "flat";
      return "normal";
    }),
    distinctUntilChanged(),
    shareReplay(1),
  );

  private readonly spotlightExpandedToggle = new Subject<void>();
  public readonly spotlightExpanded: Observable<boolean> =
    this.spotlightExpandedToggle.pipe(
      accumulate(false, (expanded) => !expanded),
      shareReplay(1),
    );

  private readonly gridModeUserSelection = new Subject<GridMode>();
  /**
   * The layout mode of the media tile grid.
   */
  public readonly gridMode: Observable<GridMode> =
    // If the user hasn't selected spotlight and somebody starts screen sharing,
    // automatically switch to spotlight mode and reset when screen sharing ends
    this.gridModeUserSelection.pipe(
      startWith(null),
      switchMap((userSelection) =>
        (userSelection === "spotlight"
          ? EMPTY
          : combineLatest([this.hasRemoteScreenShares, this.windowMode]).pipe(
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
      distinctUntilChanged(),
      shareReplay(1),
    );

  public setGridMode(value: GridMode): void {
    this.gridModeUserSelection.next(value);
  }

  public readonly layout: Observable<Layout> = this.windowMode.pipe(
    switchMap((windowMode) => {
      const spotlightLandscapeLayout = combineLatest(
        [this.grid, this.spotlight],
        (grid, spotlight): SpotlightLandscapeLayout => ({
          type: "spotlight-landscape",
          spotlight,
          grid,
        }),
      );
      const spotlightExpandedLayout = combineLatest(
        [this.spotlight, this.pip],
        (spotlight, pip): SpotlightExpandedLayout => ({
          type: "spotlight-expanded",
          spotlight,
          pip: pip ?? undefined,
        }),
      );

      switch (windowMode) {
        case "normal":
          return this.gridMode.pipe(
            switchMap((gridMode) => {
              switch (gridMode) {
                case "grid":
                  return combineLatest(
                    [this.grid, this.spotlight, this.screenShares],
                    (grid, spotlight, screenShares): Layout =>
                      grid.length == 2 &&
                      // There might not be a remote tile if only the local user
                      // is in the call and they're using the duplicate tiles
                      // option
                      grid.some((vm) => !vm.local) &&
                      screenShares.length === 0
                        ? {
                            type: "one-on-one",
                            local: grid.find(
                              (vm) => vm.local,
                            ) as LocalUserMediaViewModel,
                            remote: grid.find(
                              (vm) => !vm.local,
                            ) as RemoteUserMediaViewModel,
                          }
                        : {
                            type: "grid",
                            spotlight:
                              screenShares.length > 0 ? spotlight : undefined,
                            grid,
                          },
                  );
                case "spotlight":
                  return this.spotlightExpanded.pipe(
                    switchMap((expanded) =>
                      expanded
                        ? spotlightExpandedLayout
                        : spotlightLandscapeLayout,
                    ),
                  );
              }
            }),
          );
        case "narrow":
          return combineLatest(
            [this.grid, this.spotlight],
            (grid, spotlight): SpotlightPortraitLayout => ({
              type: "spotlight-portrait",
              spotlight,
              grid,
            }),
          );
        case "flat":
          return this.gridMode.pipe(
            switchMap((gridMode) => {
              switch (gridMode) {
                case "grid":
                  // Yes, grid mode actually gets you a "spotlight" layout in
                  // this window mode.
                  return spotlightLandscapeLayout;
                case "spotlight":
                  return spotlightExpandedLayout;
              }
            }),
          );
        case "pip":
          return this.spotlight.pipe(
            map((spotlight): PipLayout => ({ type: "pip", spotlight })),
          );
      }
    }),
    shareReplay(1),
  );

  public showSpotlightIndicators: Observable<boolean> = this.layout.pipe(
    map((l) => l.type !== "grid"),
    distinctUntilChanged(),
    shareReplay(1),
  );

  public showSpeakingIndicators: Observable<boolean> = this.layout.pipe(
    map((l) => l.type !== "one-on-one" && l.type !== "spotlight-expanded"),
    distinctUntilChanged(),
    shareReplay(1),
  );

  // To work around https://github.com/crimx/observable-hooks/issues/131 we must
  // wrap the emitted function here in a non-function wrapper type
  public readonly toggleSpotlightExpanded: Observable<
    readonly [(() => void) | null]
  > = this.layout.pipe(
    map(
      (l) =>
        l.type === "spotlight-landscape" || l.type === "spotlight-expanded",
    ),
    distinctUntilChanged(),
    map(
      (enabled) =>
        [
          enabled ? (): void => this.spotlightExpandedToggle.next() : null,
        ] as const,
    ),
    shareReplay(1),
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
