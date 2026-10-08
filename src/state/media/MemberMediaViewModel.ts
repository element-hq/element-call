/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Behavior,
  E2eeType,
  type EncryptionError,
  type EncryptionSystem,
  type MediaTrack,
  type ObservableScope,
  type MemberMedia,
  type RTCMember,
  trackBySource$,
  type VideoMediaTrack,
} from "@element-hq/matrixrtc-sdk";
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

import { type BaseMediaViewModel, createBaseMedia } from "./MediaViewModel";
import { type UserMediaViewModel } from "./UserMediaViewModel";
import { type ScreenShareViewModel } from "./ScreenShareViewModel";

/** How often a view model reads a track's RTP statistics while it needs them. */
export const statsIntervalMs = 1000;

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
   * The video track for this media.
   */
  video$: Behavior<VideoMediaTrack | undefined>;
  /**
   * The URL of the transport on which this member should be publishing.
   * Exposed for debugging.
   */
  focusUrl$: Behavior<string | undefined>;
  /**
   * Whether there should be a warning that this media is unencrypted.
   */
  unencryptedWarning$: Behavior<boolean>;
  encryptionStatus$: Behavior<EncryptionStatus>;
}

/** The member whose media this is, as far as the media view models read it. */
export type MediaMember = Pick<RTCMember, "local"> & MemberMedia;

export interface MemberMediaInputs extends BaseMediaViewModel {
  member: MediaMember;
  audioSource: "microphone" | "screenShareAudio";
  videoSource: "camera" | "screenShare";
  focusUrl$: Behavior<string | undefined>;
  encryptionSystem: EncryptionSystem;
}

export function createMemberMedia(
  scope: ObservableScope,
  {
    member,
    audioSource,
    videoSource,
    focusUrl$,
    encryptionSystem,
    ...inputs
  }: MemberMediaInputs,
): BaseMemberMediaViewModel {
  const audio$ = trackBySource$(scope, member.tracks$, audioSource);
  const video$ = trackBySource$(scope, member.tracks$, videoSource);
  const unencrypted$ = (
    track$: Behavior<MediaTrack | undefined>,
  ): Observable<boolean> =>
    track$.pipe(map((track) => track !== undefined && !track.encrypted));

  return {
    ...createBaseMedia(inputs),
    video$,
    focusUrl$,
    unencryptedWarning$: scope.behavior(
      combineLatest(
        [unencrypted$(audio$), unencrypted$(video$)],
        (a, v) => encryptionSystem.kind !== E2eeType.NONE && (a || v),
      ),
    ),
    encryptionStatus$: scope.behavior(
      member.tracks$.pipe(
        switchMap((tracks): Observable<EncryptionStatus> => {
          if (tracks === null) return of(EncryptionStatus.Connecting);
          if (member.local || encryptionSystem.kind === E2eeType.NONE)
            return of(EncryptionStatus.Okay);
          const perParticipant =
            encryptionSystem.kind === E2eeType.PER_PARTICIPANT;
          return combineLatest([
            encryptionError$(member.encryptionError$, "MissingKey"),
            encryptionError$(member.encryptionError$, "InvalidKey"),
            receivingOkay$(audio$),
            receivingOkay$(video$),
          ]).pipe(
            map(([keyMissing, keyInvalid, audioOkay, videoOkay]) => {
              if (perParticipant && keyMissing)
                return EncryptionStatus.KeyMissing;
              if (keyInvalid)
                return perParticipant
                  ? EncryptionStatus.KeyInvalid
                  : EncryptionStatus.PasswordInvalid;
              if (audioOkay || videoOkay) return EncryptionStatus.Okay;
              return undefined; // no change
            }),
            filter((x) => x !== undefined),
            startWith(EncryptionStatus.Connecting),
          );
        }),
      ),
    ),
  };
}

function encryptionError$(
  errors$: Observable<EncryptionError>,
  criteria: EncryptionError,
): Observable<boolean> {
  return errors$.pipe(
    map((error) => error === criteria),
    distinctUntilChanged(),
    throttleTime(1000), // Throttle to avoid spamming the UI
    startWith(false),
  );
}

/**
 * Whether frames arrive and decode, which is the only sign that the key in
 * use is the right one.
 */
function receivingOkay$(
  track$: Behavior<MediaTrack | undefined>,
): Observable<boolean | undefined> {
  let last: { framesDecoded?: number; framesReceived?: number } = {};
  return track$.pipe(
    switchMap((track) => track?.stats$(statsIntervalMs) ?? of(undefined)),
    map((stats): boolean | undefined => {
      if (stats === undefined || stats.type !== "inbound-rtp") return undefined;
      const { framesDecoded, framesReceived } =
        stats as RTCInboundRtpStreamStats;
      const previous = last;
      last = { framesDecoded, framesReceived };
      if (
        framesReceived === undefined ||
        previous.framesReceived === undefined ||
        framesDecoded === undefined ||
        previous.framesDecoded === undefined
      )
        return undefined;
      const received = framesReceived - previous.framesReceived;
      if (received > 0) return framesDecoded - previous.framesDecoded > 0;
      return undefined; // no change
    }),
    filter((x) => typeof x === "boolean"),
    startWith(undefined),
  );
}

/**
 * Media belonging to an active member of the call.
 */
export type MemberMediaViewModel = UserMediaViewModel | ScreenShareViewModel;
