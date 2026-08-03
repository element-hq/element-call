/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Room as LivekitRoom,
  RoomEvent as LivekitRoomEvent,
  type Participant,
  type Track,
} from "livekit-client";
import {
  type AudioSource,
  roomEventSelector,
  type TrackReference,
  type VideoSource,
} from "@livekit/components-core";
import { type LocalParticipant, type RemoteParticipant } from "livekit-client";
import {
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  type Observable,
  of,
  startWith,
  switchMap,
  throttleTime,
} from "rxjs";

import { type Behavior } from "../Behavior";
import { type BaseMediaViewModel, createBaseMedia } from "./MediaViewModel";
import { type EncryptionSystem } from "../../e2ee/sharedKeyManagement";
import { type ObservableScope } from "../ObservableScope";
import { observeTrackReference$ } from "../observeTrackReference";
import { E2eeType } from "../../e2ee/e2eeType";
import { observeInboundRtpStreamStats$ } from "./observeRtpStreamStats";
import { type UserMediaViewModel } from "./UserMediaViewModel";
import { type ScreenShareViewModel } from "./ScreenShareViewModel";

// TODO: Encryption status is kinda broken and thus unused right now. Remove?
export enum EncryptionStatus {
  Connecting,
  Okay,
  KeyMissing,
  KeyInvalid,
  PasswordInvalid,
}

/**
 * Properties common to all MemberMediaViewModels.
 */
export interface BaseMemberMediaViewModel extends BaseMediaViewModel {
  /**
   * The LiveKit video track for this media.
   */
  video$: Behavior<TrackReference | undefined>;
  /**
   * The URL of the LiveKit focus on which this member should be publishing.
   * Exposed for debugging.
   */
  focusUrl$: Behavior<string | undefined>;
  /**
   * Whether there should be a warning that this media is unencrypted.
   */
  unencryptedWarning$: Behavior<boolean>;
  encryptionStatus$: Behavior<EncryptionStatus>;
}

export interface MemberMediaInputs extends BaseMediaViewModel {
  participant$: Behavior<LocalParticipant | RemoteParticipant | null>;
  livekitRoom$: Behavior<LivekitRoom | undefined>;
  audioSource: AudioSource;
  videoSource: VideoSource;
  focusUrl$: Behavior<string | undefined>;
  encryptionSystem: EncryptionSystem;
}

export function createMemberMedia(
  scope: ObservableScope,
  {
    participant$,
    livekitRoom$,
    audioSource,
    videoSource,
    focusUrl$,
    encryptionSystem,
    ...inputs
  }: MemberMediaInputs,
): BaseMemberMediaViewModel {
  const trackBehavior$ = (
    scope: ObservableScope,
    source: Track.Source,
  ): Behavior<TrackReference | undefined> =>
    scope.behavior(
      participant$.pipe(
        switchMap((p) =>
          !p ? of(undefined) : observeTrackReference$(p, source),
        ),
      ),
    );

  const audio$ = trackBehavior$(scope, audioSource);
  const video$ = trackBehavior$(scope, videoSource);

  return {
    ...createBaseMedia(inputs),
    video$,
    focusUrl$,
    unencryptedWarning$: scope.behavior(
      combineLatest(
        [audio$, video$],
        (a, v) =>
          encryptionSystem.kind !== E2eeType.NONE &&
          (a?.publication.isEncrypted === false ||
            v?.publication.isEncrypted === false),
      ),
    ),
    encryptionStatus$: scope.behavior(
      participant$.pipe(
        switchMap((participant): Observable<EncryptionStatus> => {
          if (!participant) {
            return of(EncryptionStatus.Connecting);
          } else if (
            participant.isLocal ||
            encryptionSystem.kind === E2eeType.NONE
          ) {
            return of(EncryptionStatus.Okay);
          } else if (encryptionSystem.kind === E2eeType.PER_PARTICIPANT) {
            return combineLatest([
              encryptionErrorObservable$(
                livekitRoom$,
                participant,
                encryptionSystem,
                "MissingKey",
              ),
              encryptionErrorObservable$(
                livekitRoom$,
                participant,
                encryptionSystem,
                "InvalidKey",
              ),
              observeRemoteTrackReceivingOkay$(participant, audioSource),
              observeRemoteTrackReceivingOkay$(participant, videoSource),
            ]).pipe(
              map(([keyMissing, keyInvalid, audioOkay, videoOkay]) => {
                if (keyMissing) return EncryptionStatus.KeyMissing;
                if (keyInvalid) return EncryptionStatus.KeyInvalid;
                if (audioOkay || videoOkay) return EncryptionStatus.Okay;
                return undefined; // no change
              }),
              filter((x) => !!x),
              startWith(EncryptionStatus.Connecting),
            );
          } else {
            return combineLatest([
              encryptionErrorObservable$(
                livekitRoom$,
                participant,
                encryptionSystem,
                "InvalidKey",
              ),
              observeRemoteTrackReceivingOkay$(participant, audioSource),
              observeRemoteTrackReceivingOkay$(participant, videoSource),
            ]).pipe(
              map(
                ([keyInvalid, audioOkay, videoOkay]):
                  | EncryptionStatus
                  | undefined => {
                  if (keyInvalid) return EncryptionStatus.PasswordInvalid;
                  if (audioOkay || videoOkay) return EncryptionStatus.Okay;
                  return undefined; // no change
                },
              ),
              filter((x) => !!x),
              startWith(EncryptionStatus.Connecting),
            );
          }
        }),
      ),
    ),
  };
}

function encryptionErrorObservable$(
  room$: Behavior<LivekitRoom | undefined>,
  participant: Participant,
  encryptionSystem: EncryptionSystem,
  criteria: string,
): Observable<boolean> {
  return room$.pipe(
    switchMap((room) => {
      if (room === undefined) return of(false);
      return roomEventSelector(room, LivekitRoomEvent.EncryptionError).pipe(
        map((e) => {
          const [err] = e;
          if (encryptionSystem.kind === E2eeType.PER_PARTICIPANT) {
            return (
              // Ideally we would pull the participant identity from the field on the error.
              // However, it gets lost in the serialization process between workers.
              // So, instead we do a string match
              (err?.message.includes(participant.identity) &&
                err?.message.includes(criteria)) ??
              false
            );
          } else if (encryptionSystem.kind === E2eeType.SHARED_KEY) {
            return !!err?.message.includes(criteria);
          }

          return false;
        }),
      );
    }),
    distinctUntilChanged(),
    throttleTime(1000), // Throttle to avoid spamming the UI
    startWith(false),
  );
}

function observeRemoteTrackReceivingOkay$(
  participant: Participant,
  source: Track.Source,
): Observable<boolean | undefined> {
  let lastStats: {
    framesDecoded: number | undefined;
    framesDropped: number | undefined;
    framesReceived: number | undefined;
  } = {
    framesDecoded: undefined,
    framesDropped: undefined,
    framesReceived: undefined,
  };

  return observeInboundRtpStreamStats$(participant, source).pipe(
    map((stats) => {
      if (!stats) return undefined;
      const { framesDecoded, framesDropped, framesReceived } = stats;
      return {
        framesDecoded,
        framesDropped,
        framesReceived,
      };
    }),
    filter((newStats) => !!newStats),
    map((newStats): boolean | undefined => {
      const oldStats = lastStats;
      lastStats = newStats;
      if (
        typeof newStats.framesReceived === "number" &&
        typeof oldStats.framesReceived === "number" &&
        typeof newStats.framesDecoded === "number" &&
        typeof oldStats.framesDecoded === "number"
      ) {
        const framesReceivedDelta =
          newStats.framesReceived - oldStats.framesReceived;
        const framesDecodedDelta =
          newStats.framesDecoded - oldStats.framesDecoded;

        // if we received >0 frames and managed to decode >0 frames then we treat that as success

        if (framesReceivedDelta > 0) {
          return framesDecodedDelta > 0;
        }
      }

      // no change
      return undefined;
    }),
    filter((x) => typeof x === "boolean"),
    startWith(undefined),
  );
}

/**
 * Media belonging to an active member of the call.
 */
export type MemberMediaViewModel = UserMediaViewModel | ScreenShareViewModel;
