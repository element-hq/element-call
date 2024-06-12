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
  concatMap,
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
  switchMap,
  throttleTime,
  timer,
  withLatestFrom,
  zip,
} from "rxjs";
import { logger } from "matrix-js-sdk/src/logger";

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
  RemoteUserMediaViewModel,
  ScreenShareViewModel,
  UserMediaViewModel,
} from "./MediaViewModel";
import { finalizeValue } from "../observable-utils";
import { ObservableScope } from "./ObservableScope";

// How long we wait after a focus switch before showing the real participant
// list again
const POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS = 3000;

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

export interface OneOnOneLayout {
  type: "one-on-one";
  spotlight?: ScreenShareViewModel[];
  local: LocalUserMediaViewModel;
  remote: RemoteUserMediaViewModel;
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
  | OneOnOneLayout
  | FullScreenLayout
  | PipLayout;

export type GridMode = "grid" | "spotlight";

export type WindowMode = "normal" | "full screen" | "pip";

/**
 * Sorting bins defining the order in which media tiles appear in the layout.
 */
enum SortingBin {
  SelfAlwaysShown,
  Presenters,
  Speakers,
  VideoAndAudio,
  Video,
  Audio,
  NoMedia,
  SelfNotAlwaysShown,
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
    this.vm =
      participant instanceof LocalParticipant
        ? new LocalUserMediaViewModel(id, member, participant, callEncrypted)
        : new RemoteUserMediaViewModel(id, member, participant, callEncrypted);

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

type MediaItem = UserMedia | ScreenShare;

function findMatrixMember(
  room: MatrixRoom,
  id: string,
): RoomMember | undefined {
  if (id === "local")
    return room.getMember(room.client.getUserId()!) ?? undefined;

  const parts = id.split(":");
  // must be at least 3 parts because we know the first part is a userId which must necessarily contain a colon
  if (parts.length < 3) {
    logger.warn(
      "Livekit participants ID doesn't look like a userId:deviceId combination",
    );
    return undefined;
  }

  parts.pop();
  const userId = parts.join(":");

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

  private readonly mediaItems: Observable<MediaItem[]> = combineLatest([
    this.remoteParticipants,
    observeParticipantMedia(this.livekitRoom.localParticipant),
  ]).pipe(
    scan(
      (prevItems, [remoteParticipants, { participant: localParticipant }]) => {
        const newItems = new Map(
          function* (this: CallViewModel): Iterable<[string, MediaItem]> {
            for (const p of [localParticipant, ...remoteParticipants]) {
              const userMediaId = p === localParticipant ? "local" : p.identity;
              const member = findMatrixMember(this.matrixRoom, userMediaId);
              if (member === undefined)
                logger.warn(
                  `Ruh, roh! No matrix member found for SFU participant '${p.identity}': creating g-g-g-ghost!`,
                );

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
        return newItems;
      },
      new Map<string, MediaItem>(),
    ),
    map((ms) => [...ms.values()]),
    finalizeValue((ts) => {
      for (const t of ts) t.destroy();
    }),
    shareReplay(1),
  );

  private readonly userMedia: Observable<UserMedia[]> = this.mediaItems.pipe(
    map((ms) => ms.filter((m): m is UserMedia => m instanceof UserMedia)),
  );

  private readonly screenShares: Observable<ScreenShare[]> =
    this.mediaItems.pipe(
      map((ms) => ms.filter((m): m is ScreenShare => m instanceof ScreenShare)),
      shareReplay(1),
    );

  private readonly hasRemoteScreenShares: Observable<boolean> =
    this.screenShares.pipe(
      map((ms) => ms.find((m) => !m.vm.local) !== undefined),
      distinctUntilChanged(),
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
          // If the previous speaker (not the local user) is still speaking,
          // stick with them rather than switching eagerly to someone else
          (prev === null || prev.vm.local
            ? null
            : ms.find(([m, s]) => m === prev && s)?.[0]) ??
          // Otherwise, select any remote user who is speaking
          ms.find(([m, s]) => !m.vm.local && s)?.[0] ??
          // Otherwise, stick with the person who was last speaking
          prev ??
          // Otherwise, spotlight the local user
          ms.find(([m]) => m.vm.local)?.[0] ??
          null,
        null,
      ),
      distinctUntilChanged(),
      shareReplay(1),
      throttleTime(1600, undefined, { leading: true, trailing: true }),
    );

  private readonly grid: Observable<UserMediaViewModel[]> = this.userMedia.pipe(
    switchMap((ms) => {
      const bins = ms.map((m) =>
        combineLatest(
          [
            m.speaker,
            m.presenter,
            m.vm.audioEnabled,
            m.vm.videoEnabled,
            m.vm instanceof LocalUserMediaViewModel
              ? m.vm.alwaysShow
              : of(false),
          ],
          (speaker, presenter, audio, video, alwaysShow) => {
            let bin: SortingBin;
            if (m.vm.local)
              bin = alwaysShow
                ? SortingBin.SelfAlwaysShown
                : SortingBin.SelfNotAlwaysShown;
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

  private readonly gridModeUserSelection = new Subject<GridMode>();
  /**
   * The layout mode of the media tile grid.
   */
  public readonly gridMode: Observable<GridMode> = merge(
    // Always honor a manual user selection
    this.gridModeUserSelection,
    // If the user hasn't selected spotlight and somebody starts screen sharing,
    // automatically switch to spotlight mode and reset when screen sharing ends
    this.hasRemoteScreenShares.pipe(
      withLatestFrom(this.gridModeUserSelection.pipe(startWith(null))),
      concatMap(([hasScreenShares, userSelection]) =>
        userSelection === "spotlight"
          ? EMPTY
          : of<GridMode>(hasScreenShares ? "spotlight" : "grid"),
      ),
    ),
  ).pipe(distinctUntilChanged(), shareReplay(1));

  public setGridMode(value: GridMode): void {
    this.gridModeUserSelection.next(value);
  }

  public readonly layout: Observable<Layout> = this.windowMode.pipe(
    switchMap((windowMode) => {
      switch (windowMode) {
        case "full screen":
          throw new Error("unimplemented");
        case "pip":
          throw new Error("unimplemented");
        case "normal":
          return this.gridMode.pipe(
            switchMap((gridMode) => {
              switch (gridMode) {
                case "grid":
                  return combineLatest(
                    [this.grid, this.spotlight, this.screenShares],
                    (grid, spotlight, screenShares): Layout =>
                      grid.length == 2
                        ? {
                            type: "one-on-one",
                            spotlight:
                              screenShares.length > 0 ? spotlight : undefined,
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
                              screenShares.length > 0 || grid.length > 20
                                ? spotlight
                                : undefined,
                            grid,
                          },
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
            }),
          );
      }
    }),
    shareReplay(1),
  );

  public constructor(
    // A call is permanently tied to a single Matrix room and LiveKit room
    private readonly matrixRoom: MatrixRoom,
    private readonly livekitRoom: LivekitRoom,
    private readonly encrypted: boolean,
    private readonly connectionState: Observable<ECConnectionState>,
  ) {
    super();
  }
}

export function useCallViewModel(
  matrixRoom: MatrixRoom,
  livekitRoom: LivekitRoom,
  encrypted: boolean,
  connectionState: ECConnectionState,
): CallViewModel {
  const prevMatrixRoom = usePrevious(matrixRoom);
  const prevLivekitRoom = usePrevious(livekitRoom);
  const prevEncrypted = usePrevious(encrypted);
  const connectionStateObservable = useObservable(connectionState);

  const vm = useRef<CallViewModel>();
  if (
    matrixRoom !== prevMatrixRoom ||
    livekitRoom !== prevLivekitRoom ||
    encrypted !== prevEncrypted
  ) {
    vm.current?.destroy();
    vm.current = new CallViewModel(
      matrixRoom,
      livekitRoom,
      encrypted,
      connectionStateObservable,
    );
  }

  useEffect(() => vm.current?.destroy(), []);

  return vm.current!;
}
