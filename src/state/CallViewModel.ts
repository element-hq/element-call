/*
Copyright 2023 New Vector Ltd

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
  observeParticipantMedia,
} from "@livekit/components-core";
import { Room as LivekitRoom, RemoteParticipant } from "livekit-client";
import { Room as MatrixRoom, RoomMember } from "matrix-js-sdk/src/matrix";
import { useEffect, useRef } from "react";
import {
  EMPTY,
  Observable,
  combineLatest,
  concat,
  mergeAll,
  of,
  sample,
  scan,
  startWith,
  takeUntil,
  zip,
} from "rxjs";
import { state } from "@react-rxjs/core";
import { logger } from "matrix-js-sdk/src/logger";

import { ViewModel } from "./ViewModel";
import { useObservable } from "./useObservable";
import {
  ECAddonConnectionState,
  ECConnectionState,
} from "../livekit/useECConnectionState";
import { usePrevious } from "../usePrevious";
import {
  TileViewModel,
  UserMediaTileViewModel,
  ScreenShareTileViewModel,
} from "./TileViewModel";

// Represents something that should get a tile on the layout,
// ie. a user's video feed or a screen share feed.
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

// How long we wait after a focus switch before showing the real participant
// list again
const POST_FOCUS_PARTICIPANT_UPDATE_DELAY_MS = 3000;

function findMatrixMember(
  room: MatrixRoom,
  id: string,
): RoomMember | undefined {
  if (!id) return undefined;

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
  private readonly rawRemoteParticipants = state(
    connectedParticipantsObserver(this.livekitRoom),
  );

  // Lists of participants to "hold" on display, even if LiveKit claims that
  // they've left
  private readonly remoteParticipantHolds = zip(
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
                .pipe(takeUntil(this.destroyed))
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

  private readonly remoteParticipants = combineLatest(
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

  public readonly tiles = state(
    combineLatest([
      this.remoteParticipants,
      observeParticipantMedia(this.livekitRoom.localParticipant),
    ]).pipe(
      scan((ts, [remoteParticipants, { participant: localParticipant }]) => {
        const ps = [localParticipant, ...remoteParticipants];
        const tilesById = new Map(ts.map((t) => [t.id, t]));
        const now = Date.now();
        let allGhosts = true;

        const newTiles = ps.flatMap((p) => {
          const id = p.identity;
          const member = findMatrixMember(this.matrixRoom, id);
          allGhosts &&= member === undefined;
          const spokeRecently =
            p.lastSpokeAt !== undefined && now - +p.lastSpokeAt <= 10000;

          // We always start with a local participant with the empty string as
          // their ID before we're connected, this is fine and we'll be in
          // "all ghosts" mode.
          if (id !== "" && member === undefined) {
            logger.warn(
              `Ruh, roh! No matrix member found for SFU participant '${id}': creating g-g-g-ghost!`,
            );
          }

          const userMediaTile: TileDescriptor<TileViewModel> = {
            id,
            focused: false,
            isPresenter: p.isScreenShareEnabled,
            isSpeaker: (p.isSpeaking || spokeRecently) && !p.isLocal,
            hasVideo: p.isCameraEnabled,
            local: p.isLocal,
            largeBaseSize: false,
            data:
              tilesById.get(id)?.data ??
              new UserMediaTileViewModel(id, member, p),
          };

          if (p.isScreenShareEnabled) {
            const screenShareId = `${id}:screen-share`;
            const screenShareTile: TileDescriptor<TileViewModel> = {
              id: screenShareId,
              focused: true,
              isPresenter: false,
              isSpeaker: false,
              hasVideo: true,
              local: p.isLocal,
              largeBaseSize: true,
              placeNear: id,
              data:
                tilesById.get(screenShareId)?.data ??
                new ScreenShareTileViewModel(screenShareId, member, p),
            };
            return [userMediaTile, screenShareTile];
          } else {
            return [userMediaTile];
          }
        });

        // If every item is a ghost, that probably means we're still connecting
        // and shouldn't bother showing anything yet
        return allGhosts ? [] : newTiles;
      }, [] as TileDescriptor<TileViewModel>[]),
    ),
  );

  public constructor(
    // A call is permanently tied to a single Matrix room and LiveKit room
    private readonly matrixRoom: MatrixRoom,
    private readonly livekitRoom: LivekitRoom,
    private readonly connectionState: Observable<ECConnectionState>,
  ) {
    super();
  }
}

export function useCallViewModel(
  matrixRoom: MatrixRoom,
  livekitRoom: LivekitRoom,
  connectionState: ECConnectionState,
): CallViewModel {
  const prevMatrixRoom = usePrevious(matrixRoom);
  const prevLivekitRoom = usePrevious(livekitRoom);
  const connectionStateObservable = useObservable(connectionState);

  const vm = useRef<CallViewModel>();
  if (matrixRoom !== prevMatrixRoom || livekitRoom !== prevLivekitRoom) {
    vm.current?.destroy();
    vm.current = new CallViewModel(
      matrixRoom,
      livekitRoom,
      connectionStateObservable,
    );
  }

  useEffect(() => vm.current?.destroy(), []);

  return vm.current!;
}
