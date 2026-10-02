/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type AudioMediaTrack,
  type Behavior,
  E2eeType,
  type EncryptionError,
  type EncryptionSystem,
  type MediaTrack,
  type MemberMedia,
  type ObservableScope,
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

export interface MemberMediaInputs extends BaseMediaViewModel {
  media$: Behavior<MemberMedia | null>;
  audioSource: "microphone" | "screenShareAudio";
  videoSource: "camera" | "screenShare";
  focusUrl$: Behavior<string | undefined>;
  encryptionSystem: EncryptionSystem;
}

/** The member's track for a source, undefined while there is none. */
export function memberTrack$<T extends MediaTrack>(
  media$: Behavior<MemberMedia | null>,
  source: "microphone" | "camera" | "screenShare" | "screenShareAudio",
): Observable<T | undefined> {
  return media$.pipe(
    switchMap((media) =>
      media === null
        ? of(undefined)
        : (media[`${source}$`] as Behavior<T | undefined>),
    ),
  );
}

export function createMemberMedia(
  scope: ObservableScope,
  {
    media$,
    audioSource,
    videoSource,
    focusUrl$,
    encryptionSystem,
    ...inputs
  }: MemberMediaInputs,
): BaseMemberMediaViewModel {
  const audio$ = scope.behavior(
    memberTrack$<AudioMediaTrack>(media$, audioSource),
  );
  const video$ = scope.behavior(
    memberTrack$<VideoMediaTrack>(media$, videoSource),
  );
  const unencrypted$ = (
    track$: Behavior<MediaTrack | undefined>,
  ): Observable<boolean> =>
    track$.pipe(
      switchMap((track) =>
        track === undefined
          ? of(false)
          : track.encrypted$.pipe(map((encrypted) => !encrypted)),
      ),
    );

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
      media$.pipe(
        switchMap((media): Observable<EncryptionStatus> => {
          if (media === null) return of(EncryptionStatus.Connecting);
          if (media.local || encryptionSystem.kind === E2eeType.NONE)
            return of(EncryptionStatus.Okay);
          const perParticipant =
            encryptionSystem.kind === E2eeType.PER_PARTICIPANT;
          return combineLatest([
            encryptionError$(media, "MissingKey"),
            encryptionError$(media, "InvalidKey"),
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
  media: MemberMedia,
  criteria: EncryptionError,
): Observable<boolean> {
  return media.encryptionError$.pipe(
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
    switchMap((track) => track?.stats$ ?? of(undefined)),
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
