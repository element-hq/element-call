/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type AudioSource,
  type VideoSource,
  type TrackReference,
  observeParticipantEvents,
  observeParticipantMedia,
  roomEventSelector,
} from "@livekit/components-core";
import {
  type LocalParticipant,
  LocalTrack,
  LocalVideoTrack,
  type Participant,
  ParticipantEvent,
  type RemoteParticipant,
  Track,
  TrackEvent,
  facingModeFromLocalTrack,
  type Room as LivekitRoom,
  RoomEvent as LivekitRoomEvent,
  RemoteTrack,
} from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  type Observable,
  Subject,
  combineLatest,
  filter,
  fromEvent,
  interval,
  map,
  merge,
  of,
  startWith,
  switchMap,
  throttleTime,
  distinctUntilChanged,
} from "rxjs";

import { alwaysShowSelf } from "../settings/settings";
import { showConnectionStats } from "../settings/settings";
import { createToggle$ } from "../utils/observable";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";
import { type ReactionOption } from "../reactions";
import { platform } from "../Platform";
import { type MediaDevices } from "./MediaDevices";
import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { createVolumeControls, type VolumeControls } from "./VolumeControls";

export function observeTrackReference$(
  participant: Participant,
  source: Track.Source,
): Observable<TrackReference | undefined> {
  return observeParticipantMedia(participant).pipe(
    map(() => participant.getTrackPublication(source)),
    distinctUntilChanged(),
    map((publication) => publication && { participant, publication, source }),
  );
}

export function observeRtpStreamStats$(
  participant: Participant,
  source: Track.Source,
  type: "inbound-rtp" | "outbound-rtp",
): Observable<
  RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
> {
  return combineLatest([
    observeTrackReference$(participant, source),
    interval(1000).pipe(startWith(0)),
  ]).pipe(
    switchMap(async ([trackReference]) => {
      const track = trackReference?.publication?.track;
      if (
        !track ||
        !(track instanceof RemoteTrack || track instanceof LocalTrack)
      ) {
        return undefined;
      }
      const report = await track.getRTCStatsReport();
      if (!report) {
        return undefined;
      }

      for (const v of report.values()) {
        if (v.type === type) {
          return v;
        }
      }

      return undefined;
    }),
    startWith(undefined),
  );
}

function observeInboundRtpStreamStats$(
  participant: Participant,
  source: Track.Source,
): Observable<RTCInboundRtpStreamStats | undefined> {
  return observeRtpStreamStats$(participant, source, "inbound-rtp").pipe(
    map((x) => x as RTCInboundRtpStreamStats | undefined),
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

export enum EncryptionStatus {
  Connecting,
  Okay,
  KeyMissing,
  KeyInvalid,
  PasswordInvalid,
}

interface BaseMediaViewModel {
  /**
   * An opaque identifier for this media.
   */
  id: string;
  /**
   * The Matrix user to which this media belongs.
   */
  userId: string;
  displayName$: Behavior<string>;
  mxcAvatarUrl$: Behavior<string | undefined>;
}

type BaseMediaInputs = BaseMediaViewModel;

// This function exists to strip out superfluous data from the input object
function createBaseMedia({
  id,
  userId,
  displayName$,
  mxcAvatarUrl$,
}: BaseMediaInputs): BaseMediaViewModel {
  return { id, userId, displayName$, mxcAvatarUrl$ };
}

interface MemberMediaViewModel extends BaseMediaViewModel {
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

interface MemberMediaInputs extends BaseMediaViewModel {
  participant$: Behavior<LocalParticipant | RemoteParticipant | null>;
  livekitRoom$: Behavior<LivekitRoom | undefined>;
  audioSource: AudioSource;
  videoSource: VideoSource;
  focusUrl$: Behavior<string | undefined>;
  encryptionSystem: EncryptionSystem;
}

function createMemberMedia(
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
): MemberMediaViewModel {
  const trackBehavior$ = (
    source: Track.Source,
  ): Behavior<TrackReference | undefined> =>
    scope.behavior(
      participant$.pipe(
        switchMap((p) =>
          !p ? of(undefined) : observeTrackReference$(p, source),
        ),
      ),
    );

  const audio$ = trackBehavior$(audioSource);
  const video$ = trackBehavior$(videoSource);

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

interface BaseUserMediaViewModel extends MemberMediaViewModel {
  type: "user";
  speaking$: Behavior<boolean>;
  audioEnabled$: Behavior<boolean>;
  videoEnabled$: Behavior<boolean>;
  cropVideo$: Behavior<boolean>;
  toggleCropVideo: () => void;
  /**
   * The expected identity of the LiveKit participant. Exposed for debugging.
   */
  rtcBackendIdentity: string;
  handRaised$: Behavior<Date | null>;
  reaction$: Behavior<ReactionOption | null>;
  audioStreamStats$: Observable<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
  videoStreamStats$: Observable<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
}

interface BaseUserMediaInputs extends Omit<
  MemberMediaInputs,
  "audioSource" | "videoSource"
> {
  rtcBackendIdentity: string;
  handRaised$: Behavior<Date | null>;
  reaction$: Behavior<ReactionOption | null>;
  statsType: "inbound-rtp" | "outbound-rtp";
}

function createBaseUserMedia(
  scope: ObservableScope,
  {
    rtcBackendIdentity,
    handRaised$,
    reaction$,
    statsType,
    ...inputs
  }: BaseUserMediaInputs,
): BaseUserMediaViewModel {
  const { participant$ } = inputs;
  const media$ = scope.behavior(
    participant$.pipe(
      switchMap((p) => (p && observeParticipantMedia(p)) ?? of(undefined)),
    ),
  );
  const toggleCropVideo$ = new Subject<void>();

  return {
    ...createMemberMedia(scope, {
      ...inputs,
      audioSource: Track.Source.Microphone,
      videoSource: Track.Source.Camera,
    }),
    type: "user",
    speaking$: scope.behavior(
      participant$.pipe(
        switchMap((p) =>
          p
            ? observeParticipantEvents(
                p,
                ParticipantEvent.IsSpeakingChanged,
              ).pipe(map((p) => p.isSpeaking))
            : of(false),
        ),
      ),
    ),
    audioEnabled$: scope.behavior(
      media$.pipe(map((m) => m?.microphoneTrack?.isMuted === false)),
    ),
    videoEnabled$: scope.behavior(
      media$.pipe(map((m) => m?.cameraTrack?.isMuted === false)),
    ),
    cropVideo$: createToggle$(scope, true, toggleCropVideo$),
    toggleCropVideo: () => toggleCropVideo$.next(),
    rtcBackendIdentity,
    handRaised$,
    reaction$,
    audioStreamStats$: combineLatest([
      participant$,
      showConnectionStats.value$,
    ]).pipe(
      switchMap(([p, showConnectionStats]) => {
        //
        if (!p || !showConnectionStats) return of(undefined);
        return observeRtpStreamStats$(p, Track.Source.Microphone, statsType);
      }),
    ),
    videoStreamStats$: combineLatest([
      participant$,
      showConnectionStats.value$,
    ]).pipe(
      switchMap(([p, showConnectionStats]) => {
        if (!p || !showConnectionStats) return of(undefined);
        return observeRtpStreamStats$(p, Track.Source.Camera, statsType);
      }),
    ),
  };
}

export interface LocalUserMediaViewModel extends BaseUserMediaViewModel {
  local: true;
  /**
   * Whether the video should be mirrored.
   */
  mirror$: Behavior<boolean>;
  /**
   * Whether to show this tile in a highly visible location near the start of
   * the grid.
   */
  alwaysShow$: Behavior<boolean>;
  setAlwaysShow: (value: boolean) => void;
  switchCamera$: Behavior<(() => void) | null>;
}

export interface LocalUserMediaInputs extends Omit<
  BaseUserMediaInputs,
  "statsType"
> {
  participant$: Behavior<LocalParticipant | null>;
  mediaDevices: MediaDevices;
}

export function createLocalUserMedia(
  scope: ObservableScope,
  { mediaDevices, ...inputs }: LocalUserMediaInputs,
): LocalUserMediaViewModel {
  const baseUserMedia = createBaseUserMedia(scope, {
    ...inputs,
    statsType: "outbound-rtp",
  });

  /**
   * The local video track as an observable that emits whenever the track
   * changes, the camera is switched, or the track is muted.
   */
  const videoTrack$: Observable<LocalVideoTrack | null> =
    baseUserMedia.video$.pipe(
      switchMap((v) => {
        const track = v?.publication.track;
        if (!(track instanceof LocalVideoTrack)) return of(null);
        return merge(
          // Watch for track restarts because they indicate a camera switch.
          // This event is also emitted when unmuting the track object.
          fromEvent(track, TrackEvent.Restarted).pipe(
            startWith(null),
            map(() => track),
          ),
          // When the track object is muted, reset it to null.
          fromEvent(track, TrackEvent.Muted).pipe(map(() => null)),
        );
      }),
    );

  return {
    ...baseUserMedia,
    local: true,
    mirror$: scope.behavior(
      videoTrack$.pipe(
        // Mirror only front-facing cameras (those that face the user)
        map(
          (track) =>
            track !== null &&
            facingModeFromLocalTrack(track).facingMode === "user",
        ),
      ),
    ),
    alwaysShow$: alwaysShowSelf.value$,
    setAlwaysShow: alwaysShowSelf.setValue,
    switchCamera$: scope.behavior(
      platform === "desktop"
        ? of(null)
        : videoTrack$.pipe(
            map((track) => {
              if (track === null) return null;
              const facingMode = facingModeFromLocalTrack(track).facingMode;
              // If the camera isn't front or back-facing, don't provide a switch
              // camera shortcut at all
              if (facingMode !== "user" && facingMode !== "environment")
                return null;
              // Restart the track with a camera facing the opposite direction
              return (): void =>
                void track
                  .restartTrack({
                    facingMode: facingMode === "user" ? "environment" : "user",
                  })
                  .then(() => {
                    // Inform the MediaDevices which camera was chosen
                    const deviceId =
                      track.mediaStreamTrack.getSettings().deviceId;
                    if (deviceId !== undefined)
                      mediaDevices.videoInput.select(deviceId);
                  })
                  .catch((e) =>
                    logger.error("Failed to switch camera", facingMode, e),
                  );
            }),
          ),
    ),
  };
}

export interface RemoteUserMediaViewModel
  extends BaseUserMediaViewModel, VolumeControls {
  local: false;
  /**
   * Whether we are waiting for this user's LiveKit participant to exist. This
   * could be because either we or the remote party are still connecting.
   */
  waitingForMedia$: Behavior<boolean>;
}

export interface RemoteUserMediaInputs extends Omit<
  BaseUserMediaInputs,
  "statsType"
> {
  participant$: Behavior<RemoteParticipant | null>;
  pretendToBeDisconnected$: Behavior<boolean>;
}

export function createRemoteUserMedia(
  scope: ObservableScope,
  { pretendToBeDisconnected$, ...inputs }: RemoteUserMediaInputs,
): RemoteUserMediaViewModel {
  const baseUserMedia = createBaseUserMedia(scope, {
    ...inputs,
    statsType: "inbound-rtp",
  });

  return {
    ...baseUserMedia,
    ...createVolumeControls(scope, {
      pretendToBeDisconnected$,
      sink$: scope.behavior(
        inputs.participant$.pipe(map((p) => (volume) => p?.setVolume(volume))),
      ),
    }),
    local: false,
    speaking$: scope.behavior(
      pretendToBeDisconnected$.pipe(
        switchMap((disconnected) =>
          disconnected ? of(false) : baseUserMedia.speaking$,
        ),
      ),
    ),
    videoEnabled$: scope.behavior(
      pretendToBeDisconnected$.pipe(
        switchMap((disconnected) =>
          disconnected ? of(false) : baseUserMedia.videoEnabled$,
        ),
      ),
    ),
    waitingForMedia$: scope.behavior(
      combineLatest(
        [inputs.livekitRoom$, inputs.participant$],
        (livekitRoom, participant) =>
          // If livekitRoom is undefined, the user is not attempting to publish on
          // any transport and so we shouldn't expect a participant. (They might
          // be a subscribe-only bot for example.)
          livekitRoom !== undefined && participant === null,
      ),
    ),
  };
}

interface BaseScreenShareViewModel extends MemberMediaViewModel {
  type: "screen share";
}

type BaseScreenShareInputs = Omit<
  MemberMediaInputs,
  "audioSource" | "videoSource"
>;

function createBaseScreenShare(
  scope: ObservableScope,
  inputs: BaseScreenShareInputs,
): BaseScreenShareViewModel {
  return {
    ...createMemberMedia(scope, {
      ...inputs,
      audioSource: Track.Source.ScreenShareAudio,
      videoSource: Track.Source.ScreenShare,
    }),
    type: "screen share",
  };
}

export interface LocalScreenShareViewModel extends BaseScreenShareViewModel {
  local: true;
}

interface LocalScreenShareInputs extends BaseScreenShareInputs {
  participant$: Behavior<LocalParticipant | null>;
}

export function createLocalScreenShare(
  scope: ObservableScope,
  inputs: LocalScreenShareInputs,
): LocalScreenShareViewModel {
  return { ...createBaseScreenShare(scope, inputs), local: true };
}

export interface RemoteScreenShareViewModel extends BaseScreenShareViewModel {
  local: false;
  /**
   * Whether this screen share's video should be displayed.
   */
  videoEnabled$: Behavior<boolean>;
}

interface RemoteScreenShareInputs extends BaseScreenShareInputs {
  participant$: Behavior<RemoteParticipant | null>;
  pretendToBeDisconnected$: Behavior<boolean>;
}

export function createRemoteScreenShare(
  scope: ObservableScope,
  { pretendToBeDisconnected$, ...inputs }: RemoteScreenShareInputs,
): RemoteScreenShareViewModel {
  return {
    ...createBaseScreenShare(scope, inputs),
    local: false,
    videoEnabled$: scope.behavior(
      pretendToBeDisconnected$.pipe(map((disconnected) => !disconnected)),
    ),
  };
}

/**
 * Some participant's media.
 */
export type MediaViewModel = UserMediaViewModel | ScreenShareViewModel;
/**
 * Some participant's user media (i.e. their microphone and camera feed).
 */
export type UserMediaViewModel =
  | LocalUserMediaViewModel
  | RemoteUserMediaViewModel;
/**
 * Some participant's screen share media.
 */
export type ScreenShareViewModel =
  | LocalScreenShareViewModel
  | RemoteScreenShareViewModel;
