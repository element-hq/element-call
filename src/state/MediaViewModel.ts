/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type AudioSource,
  type TrackReferenceOrPlaceholder,
  type VideoSource,
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
import { type RoomMember } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  BehaviorSubject,
  type Observable,
  Subject,
  combineLatest,
  distinctUntilKeyChanged,
  filter,
  fromEvent,
  interval,
  map,
  merge,
  of,
  startWith,
  switchMap,
  throttleTime,
} from "rxjs";

import { alwaysShowSelf } from "../settings/settings";
import { showConnectionStats } from "../settings/settings";
import { accumulate } from "../utils/observable";
import { type EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";
import { type ReactionOption } from "../reactions";
import { platform } from "../Platform";
import { type MediaDevices } from "./MediaDevices";
import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";

export function observeTrackReference$(
  participant: Participant,
  source: Track.Source,
): Observable<TrackReferenceOrPlaceholder> {
  return observeParticipantMedia(participant).pipe(
    map(() => ({
      participant: participant,
      publication: participant.getTrackPublication(source),
      source,
    })),
    distinctUntilKeyChanged("publication"),
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

export function observeInboundRtpStreamStats$(
  participant: Participant,
  source: Track.Source,
): Observable<RTCInboundRtpStreamStats | undefined> {
  return observeRtpStreamStats$(participant, source, "inbound-rtp").pipe(
    map((x) => x as RTCInboundRtpStreamStats | undefined),
  );
}

export function observeOutboundRtpStreamStats$(
  participant: Participant,
  source: Track.Source,
): Observable<RTCOutboundRtpStreamStats | undefined> {
  return observeRtpStreamStats$(participant, source, "outbound-rtp").pipe(
    map((x) => x as RTCOutboundRtpStreamStats | undefined),
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
  room: LivekitRoom,
  participant: Participant,
  encryptionSystem: EncryptionSystem,
  criteria: string,
): Observable<boolean> {
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

abstract class BaseMediaViewModel {
  /**
   * The LiveKit video track for this media.
   */
  public readonly video$: Behavior<TrackReferenceOrPlaceholder | undefined>;
  /**
   * Whether there should be a warning that this media is unencrypted.
   */
  public readonly unencryptedWarning$: Behavior<boolean>;

  public readonly encryptionStatus$: Behavior<EncryptionStatus>;

  /**
   * Whether this media corresponds to the local participant.
   */
  public abstract readonly local: boolean;

  private observeTrackReference$(
    source: Track.Source,
  ): Behavior<TrackReferenceOrPlaceholder | undefined> {
    return this.scope.behavior(
      this.participant$.pipe(
        switchMap((p) =>
          p === undefined ? of(undefined) : observeTrackReference$(p, source),
        ),
      ),
    );
  }

  public constructor(
    protected readonly scope: ObservableScope,
    /**
     * An opaque identifier for this media.
     */
    public readonly id: string,
    /**
     * The Matrix room member to which this media belongs.
     */
    // TODO: Fully separate the data layer from the UI layer by keeping the
    // member object internal
    public readonly member: RoomMember,
    // We don't necessarily have a participant if a user connects via MatrixRTC but not (yet) through
    // livekit.
    protected readonly participant$: Observable<
      LocalParticipant | RemoteParticipant | undefined
    >,

    encryptionSystem: EncryptionSystem,
    audioSource: AudioSource,
    videoSource: VideoSource,
    livekitRoom: LivekitRoom,
    public readonly focusURL: string,
    public readonly displayName$: Behavior<string>,
  ) {
    const audio$ = this.observeTrackReference$(audioSource);
    this.video$ = this.observeTrackReference$(videoSource);

    this.unencryptedWarning$ = this.scope.behavior(
      combineLatest(
        [audio$, this.video$],
        (a, v) =>
          encryptionSystem.kind !== E2eeType.NONE &&
          (a?.publication?.isEncrypted === false ||
            v?.publication?.isEncrypted === false),
      ),
    );

    this.encryptionStatus$ = this.scope.behavior(
      this.participant$.pipe(
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
                livekitRoom,
                participant,
                encryptionSystem,
                "MissingKey",
              ),
              encryptionErrorObservable$(
                livekitRoom,
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
                livekitRoom,
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
    );
  }
}

/**
 * Some participant's media.
 */
export type MediaViewModel = UserMediaViewModel | ScreenShareViewModel;
export type UserMediaViewModel =
  | LocalUserMediaViewModel
  | RemoteUserMediaViewModel;

/**
 * Some participant's user media.
 */
abstract class BaseUserMediaViewModel extends BaseMediaViewModel {
  private readonly _speaking$ = this.scope.behavior(
    this.participant$.pipe(
      switchMap((p) =>
        p
          ? observeParticipantEvents(
              p,
              ParticipantEvent.IsSpeakingChanged,
            ).pipe(map((p) => p.isSpeaking))
          : of(false),
      ),
    ),
  );
  /**
   * Whether the participant is speaking.
   */
  // Getter backed by a private field so that subclasses can override it
  public get speaking$(): Behavior<boolean> {
    return this._speaking$;
  }

  /**
   * Whether this participant is sending audio (i.e. is unmuted on their side).
   */
  public readonly audioEnabled$: Behavior<boolean>;

  private readonly _videoEnabled$: Behavior<boolean>;
  /**
   * Whether this participant is sending video.
   */
  // Getter backed by a private field so that subclasses can override it
  public get videoEnabled$(): Behavior<boolean> {
    return this._videoEnabled$;
  }

  private readonly _cropVideo$ = new BehaviorSubject(true);
  /**
   * Whether the tile video should be contained inside the tile or be cropped to fit.
   */
  public readonly cropVideo$: Behavior<boolean> = this._cropVideo$;

  public constructor(
    scope: ObservableScope,
    id: string,
    member: RoomMember,
    participant$: Observable<LocalParticipant | RemoteParticipant | undefined>,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    focusUrl: string,
    displayName$: Behavior<string>,
    public readonly handRaised$: Behavior<Date | null>,
    public readonly reaction$: Behavior<ReactionOption | null>,
  ) {
    super(
      scope,
      id,
      member,
      participant$,
      encryptionSystem,
      Track.Source.Microphone,
      Track.Source.Camera,
      livekitRoom,
      focusUrl,
      displayName$,
    );

    const media$ = this.scope.behavior(
      participant$.pipe(
        switchMap((p) => (p && observeParticipantMedia(p)) ?? of(undefined)),
      ),
    );
    this.audioEnabled$ = this.scope.behavior(
      media$.pipe(map((m) => m?.microphoneTrack?.isMuted === false)),
    );
    this._videoEnabled$ = this.scope.behavior(
      media$.pipe(map((m) => m?.cameraTrack?.isMuted === false)),
    );
  }

  public toggleFitContain(): void {
    this._cropVideo$.next(!this._cropVideo$.value);
  }

  public get local(): boolean {
    return this instanceof LocalUserMediaViewModel;
  }

  public abstract get audioStreamStats$(): Observable<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
  public abstract get videoStreamStats$(): Observable<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
}

/**
 * The local participant's user media.
 */
export class LocalUserMediaViewModel extends BaseUserMediaViewModel {
  /**
   * The local video track as an observable that emits whenever the track
   * changes, the camera is switched, or the track is muted.
   */
  private readonly videoTrack$: Observable<LocalVideoTrack | null> =
    this.video$.pipe(
      switchMap((v) => {
        const track = v?.publication?.track;
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

  /**
   * Whether the video should be mirrored.
   */
  public readonly mirror$ = this.scope.behavior(
    this.videoTrack$.pipe(
      // Mirror only front-facing cameras (those that face the user)
      map(
        (track) =>
          track !== null &&
          facingModeFromLocalTrack(track).facingMode === "user",
      ),
    ),
  );

  /**
   * Whether to show this tile in a highly visible location near the start of
   * the grid.
   */
  public readonly alwaysShow$ = alwaysShowSelf.value$;
  public readonly setAlwaysShow = alwaysShowSelf.setValue;

  /**
   * Callback for switching between the front and back cameras.
   */
  public readonly switchCamera$: Behavior<(() => void) | null> =
    this.scope.behavior(
      platform === "desktop"
        ? of(null)
        : this.videoTrack$.pipe(
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
                      this.mediaDevices.videoInput.select(deviceId);
                  })
                  .catch((e) =>
                    logger.error("Failed to switch camera", facingMode, e),
                  );
            }),
          ),
    );

  public constructor(
    scope: ObservableScope,
    id: string,
    member: RoomMember,
    participant$: Behavior<LocalParticipant | undefined>,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    focusURL: string,
    private readonly mediaDevices: MediaDevices,
    displayName$: Behavior<string>,
    handRaised$: Behavior<Date | null>,
    reaction$: Behavior<ReactionOption | null>,
  ) {
    super(
      scope,
      id,
      member,
      participant$,
      encryptionSystem,
      livekitRoom,
      focusURL,
      displayName$,
      handRaised$,
      reaction$,
    );
  }

  public audioStreamStats$ = combineLatest([
    this.participant$,
    showConnectionStats.value$,
  ]).pipe(
    switchMap(([p, showConnectionStats]) => {
      if (!p || !showConnectionStats) return of(undefined);
      return observeOutboundRtpStreamStats$(p, Track.Source.Microphone);
    }),
  );

  public videoStreamStats$ = combineLatest([
    this.participant$,
    showConnectionStats.value$,
  ]).pipe(
    switchMap(([p, showConnectionStats]) => {
      if (!p || !showConnectionStats) return of(undefined);
      return observeOutboundRtpStreamStats$(p, Track.Source.Camera);
    }),
  );
}

/**
 * A remote participant's user media.
 */
export class RemoteUserMediaViewModel extends BaseUserMediaViewModel {
  // This private field is used to override the value from the superclass
  private __speaking$: Behavior<boolean>;
  public get speaking$(): Behavior<boolean> {
    return this.__speaking$;
  }

  private readonly locallyMutedToggle$ = new Subject<void>();
  private readonly localVolumeAdjustment$ = new Subject<number>();
  private readonly localVolumeCommit$ = new Subject<void>();

  /**
   * The volume to which this participant's audio is set, as a scalar
   * multiplier.
   */
  public readonly localVolume$ = this.scope.behavior<number>(
    merge(
      this.locallyMutedToggle$.pipe(map(() => "toggle mute" as const)),
      this.localVolumeAdjustment$,
      this.localVolumeCommit$.pipe(map(() => "commit" as const)),
    ).pipe(
      accumulate({ volume: 1, committedVolume: 1 }, (state, event) => {
        switch (event) {
          case "toggle mute":
            return {
              ...state,
              volume: state.volume === 0 ? state.committedVolume : 0,
            };
          case "commit":
            // Dragging the slider to zero should have the same effect as
            // muting: keep the original committed volume, as if it were never
            // dragged
            return {
              ...state,
              committedVolume:
                state.volume === 0 ? state.committedVolume : state.volume,
            };
          default:
            // Volume adjustment
            return { ...state, volume: event };
        }
      }),
      map(({ volume }) => volume),
    ),
  );

  // This private field is used to override the value from the superclass
  private __videoEnabled$: Behavior<boolean>;
  public get videoEnabled$(): Behavior<boolean> {
    return this.__videoEnabled$;
  }

  /**
   * Whether this participant's audio is disabled.
   */
  public readonly locallyMuted$ = this.scope.behavior<boolean>(
    this.localVolume$.pipe(map((volume) => volume === 0)),
  );

  public constructor(
    scope: ObservableScope,
    id: string,
    member: RoomMember,
    participant$: Observable<RemoteParticipant | undefined>,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    focusUrl: string,
    private readonly pretendToBeDisconnected$: Behavior<boolean>,
    displayname$: Behavior<string>,
    handRaised$: Behavior<Date | null>,
    reaction$: Behavior<ReactionOption | null>,
  ) {
    super(
      scope,
      id,
      member,
      participant$,
      encryptionSystem,
      livekitRoom,
      focusUrl,
      displayname$,
      handRaised$,
      reaction$,
    );

    this.__speaking$ = this.scope.behavior(
      pretendToBeDisconnected$.pipe(
        switchMap((disconnected) =>
          disconnected ? of(false) : super.speaking$,
        ),
      ),
    );

    this.__videoEnabled$ = this.scope.behavior(
      pretendToBeDisconnected$.pipe(
        switchMap((disconnected) =>
          disconnected ? of(false) : super.videoEnabled$,
        ),
      ),
    );

    // Sync the local volume with LiveKit
    combineLatest([
      participant$,
      // The local volume, taking into account whether we're supposed to pretend
      // that the audio stream is disconnected (since we don't necessarily want
      // that to modify the UI state).
      this.pretendToBeDisconnected$.pipe(
        switchMap((disconnected) => (disconnected ? of(0) : this.localVolume$)),
        this.scope.bind(),
      ),
    ]).subscribe(([p, volume]) => p?.setVolume(volume));
  }

  public toggleLocallyMuted(): void {
    this.locallyMutedToggle$.next();
  }

  public setLocalVolume(value: number): void {
    this.localVolumeAdjustment$.next(value);
  }

  public commitLocalVolume(): void {
    this.localVolumeCommit$.next();
  }

  public audioStreamStats$ = combineLatest([
    this.participant$,
    showConnectionStats.value$,
  ]).pipe(
    switchMap(([p, showConnectionStats]) => {
      if (!p || !showConnectionStats) return of(undefined);
      return observeInboundRtpStreamStats$(p, Track.Source.Microphone);
    }),
  );

  public videoStreamStats$ = combineLatest([
    this.participant$,
    showConnectionStats.value$,
  ]).pipe(
    switchMap(([p, showConnectionStats]) => {
      if (!p || !showConnectionStats) return of(undefined);
      return observeInboundRtpStreamStats$(p, Track.Source.Camera);
    }),
  );
}

/**
 * Some participant's screen share media.
 */
export class ScreenShareViewModel extends BaseMediaViewModel {
  /**
   * Whether this screen share's video should be displayed.
   */
  public readonly videoEnabled$ = this.scope.behavior(
    this.pretendToBeDisconnected$.pipe(map((disconnected) => !disconnected)),
  );

  public constructor(
    scope: ObservableScope,
    id: string,
    member: RoomMember,
    participant$: Observable<LocalParticipant | RemoteParticipant>,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    focusUrl: string,
    private readonly pretendToBeDisconnected$: Behavior<boolean>,
    displayname$: Behavior<string>,
    public readonly local: boolean,
  ) {
    super(
      scope,
      id,
      member,
      participant$,
      encryptionSystem,
      Track.Source.ScreenShareAudio,
      Track.Source.ScreenShare,
      livekitRoom,
      focusUrl,
      displayname$,
    );
  }
}
