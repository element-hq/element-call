/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  AudioSource,
  TrackReferenceOrPlaceholder,
  VideoSource,
  observeParticipantEvents,
  observeParticipantMedia,
  roomEventSelector,
} from "@livekit/components-core";
import {
  LocalParticipant,
  LocalTrack,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  Track,
  TrackEvent,
  facingModeFromLocalTrack,
  Room as LivekitRoom,
  RoomEvent as LivekitRoomEvent,
  RemoteTrack,
} from "livekit-client";
import { RoomMember, RoomMemberEvent } from "matrix-js-sdk/src/matrix";
import {
  BehaviorSubject,
  Observable,
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
import { useEffect } from "react";

import { ViewModel } from "./ViewModel";
import { useReactiveState } from "../useReactiveState";
import { alwaysShowSelf } from "../settings/settings";
import { accumulate } from "../utils/observable";
import { EncryptionSystem } from "../e2ee/sharedKeyManagement";
import { E2eeType } from "../e2ee/e2eeType";

// TODO: Move this naming logic into the view model
export function useDisplayName(vm: MediaViewModel): string {
  const [displayName, setDisplayName] = useReactiveState(
    () => vm.member?.rawDisplayName ?? "[👻]",
    [vm.member],
  );
  useEffect(() => {
    if (vm.member) {
      const updateName = (): void => {
        setDisplayName(vm.member!.rawDisplayName);
      };

      vm.member!.on(RoomMemberEvent.Name, updateName);
      return (): void => {
        vm.member!.removeListener(RoomMemberEvent.Name, updateName);
      };
    }
  }, [vm.member, setDisplayName]);

  return displayName;
}

export function observeTrackReference(
  participant: Observable<Participant | undefined>,
  source: Track.Source,
): Observable<TrackReferenceOrPlaceholder | undefined> {
  return participant.pipe(
    switchMap((p) => {
      if (p) {
        return observeParticipantMedia(p).pipe(
          map(() => ({
            participant: p,
            publication: p.getTrackPublication(source),
            source,
          })),
          distinctUntilKeyChanged("publication"),
        );
      } else {
        return of(undefined);
      }
    }),
  );
}

function observeRemoteTrackReceivingOkay(
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

  return combineLatest([
    observeTrackReference(of(participant), source),
    interval(1000).pipe(startWith(0)),
  ]).pipe(
    switchMap(async ([trackReference]) => {
      const track = trackReference?.publication?.track;
      if (!track || !(track instanceof RemoteTrack)) {
        return undefined;
      }
      const report = await track.getRTCStatsReport();
      if (!report) {
        return undefined;
      }

      for (const v of report.values()) {
        if (v.type === "inbound-rtp") {
          const { framesDecoded, framesDropped, framesReceived } =
            v as RTCInboundRtpStreamStats;
          return {
            framesDecoded,
            framesDropped,
            framesReceived,
          };
        }
      }

      return undefined;
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

function encryptionErrorObservable(
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

abstract class BaseMediaViewModel extends ViewModel {
  /**
   * The LiveKit video track for this media.
   */
  public readonly video: Observable<TrackReferenceOrPlaceholder | undefined>;
  /**
   * Whether there should be a warning that this media is unencrypted.
   */
  public readonly unencryptedWarning: Observable<boolean>;

  public readonly encryptionStatus: Observable<EncryptionStatus>;

  /**
   * Whether this media corresponds to the local participant.
   */
  public abstract readonly local: boolean;

  public constructor(
    /**
     * An opaque identifier for this media.
     */
    public readonly id: string,
    /**
     * The Matrix room member to which this media belongs.
     */
    // TODO: Fully separate the data layer from the UI layer by keeping the
    // member object internal
    public readonly member: RoomMember | undefined,
    // We don't necessarily have a participant if a user connects via MatrixRTC but not (yet) through
    // livekit.
    protected readonly participant: Observable<
      LocalParticipant | RemoteParticipant | undefined
    >,

    encryptionSystem: EncryptionSystem,
    audioSource: AudioSource,
    videoSource: VideoSource,
    livekitRoom: LivekitRoom,
  ) {
    super();
    const audio = observeTrackReference(participant, audioSource).pipe(
      this.scope.state(),
    );
    this.video = observeTrackReference(participant, videoSource).pipe(
      this.scope.state(),
    );
    this.unencryptedWarning = combineLatest(
      [audio, this.video],
      (a, v) =>
        encryptionSystem.kind !== E2eeType.NONE &&
        (a?.publication?.isEncrypted === false ||
          v?.publication?.isEncrypted === false),
    ).pipe(this.scope.state());

    this.encryptionStatus = this.participant.pipe(
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
            encryptionErrorObservable(
              livekitRoom,
              participant,
              encryptionSystem,
              "MissingKey",
            ),
            encryptionErrorObservable(
              livekitRoom,
              participant,
              encryptionSystem,
              "InvalidKey",
            ),
            observeRemoteTrackReceivingOkay(participant, audioSource),
            observeRemoteTrackReceivingOkay(participant, videoSource),
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
            encryptionErrorObservable(
              livekitRoom,
              participant,
              encryptionSystem,
              "InvalidKey",
            ),
            observeRemoteTrackReceivingOkay(participant, audioSource),
            observeRemoteTrackReceivingOkay(participant, videoSource),
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
      this.scope.state(),
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
  /**
   * Whether the participant is speaking.
   */
  public readonly speaking = this.participant.pipe(
    switchMap((p) =>
      p
        ? observeParticipantEvents(p, ParticipantEvent.IsSpeakingChanged).pipe(
            map((p) => p.isSpeaking),
          )
        : of(false),
    ),
    this.scope.state(),
  );

  /**
   * Whether this participant is sending audio (i.e. is unmuted on their side).
   */
  public readonly audioEnabled: Observable<boolean>;
  /**
   * Whether this participant is sending video.
   */
  public readonly videoEnabled: Observable<boolean>;

  private readonly _cropVideo = new BehaviorSubject(true);
  /**
   * Whether the tile video should be contained inside the tile or be cropped to fit.
   */
  public readonly cropVideo: Observable<boolean> = this._cropVideo;

  public constructor(
    id: string,
    member: RoomMember | undefined,
    participant: Observable<LocalParticipant | RemoteParticipant | undefined>,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
  ) {
    super(
      id,
      member,
      participant,
      encryptionSystem,
      Track.Source.Microphone,
      Track.Source.Camera,
      livekitRoom,
    );

    const media = participant.pipe(
      switchMap((p) => (p && observeParticipantMedia(p)) ?? of(undefined)),
      this.scope.state(),
    );
    this.audioEnabled = media.pipe(
      map((m) => m?.microphoneTrack?.isMuted === false),
    );
    this.videoEnabled = media.pipe(
      map((m) => m?.cameraTrack?.isMuted === false),
    );
  }

  public toggleFitContain(): void {
    this._cropVideo.next(!this._cropVideo.value);
  }

  public get local(): boolean {
    return this instanceof LocalUserMediaViewModel;
  }
}

/**
 * The local participant's user media.
 */
export class LocalUserMediaViewModel extends BaseUserMediaViewModel {
  /**
   * Whether the video should be mirrored.
   */
  public readonly mirror = this.video.pipe(
    switchMap((v) => {
      const track = v?.publication?.track;
      if (!(track instanceof LocalTrack)) return of(false);
      // Watch for track restarts, because they indicate a camera switch
      return fromEvent(track, TrackEvent.Restarted).pipe(
        startWith(null),
        // Mirror only front-facing cameras (those that face the user)
        map(() => facingModeFromLocalTrack(track).facingMode === "user"),
      );
    }),
    this.scope.state(),
  );

  /**
   * Whether to show this tile in a highly visible location near the start of
   * the grid.
   */
  public readonly alwaysShow = alwaysShowSelf.value;
  public readonly setAlwaysShow = alwaysShowSelf.setValue;

  public constructor(
    id: string,
    member: RoomMember | undefined,
    participant: Observable<LocalParticipant | undefined>,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
  ) {
    super(id, member, participant, encryptionSystem, livekitRoom);
  }
}

/**
 * A remote participant's user media.
 */
export class RemoteUserMediaViewModel extends BaseUserMediaViewModel {
  private readonly locallyMutedToggle = new Subject<void>();
  private readonly localVolumeAdjustment = new Subject<number>();
  private readonly localVolumeCommit = new Subject<void>();

  /**
   * The volume to which this participant's audio is set, as a scalar
   * multiplier.
   */
  public readonly localVolume: Observable<number> = merge(
    this.locallyMutedToggle.pipe(map(() => "toggle mute" as const)),
    this.localVolumeAdjustment,
    this.localVolumeCommit.pipe(map(() => "commit" as const)),
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
    this.scope.state(),
  );

  /**
   * Whether this participant's audio is disabled.
   */
  public readonly locallyMuted: Observable<boolean> = this.localVolume.pipe(
    map((volume) => volume === 0),
    this.scope.state(),
  );

  public constructor(
    id: string,
    member: RoomMember | undefined,
    participant: Observable<RemoteParticipant | undefined>,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
  ) {
    super(id, member, participant, encryptionSystem, livekitRoom);

    // Sync the local volume with LiveKit
    combineLatest([
      participant,
      this.localVolume.pipe(this.scope.bind()),
    ]).subscribe(([p, volume]) => p && p.setVolume(volume));
  }

  public toggleLocallyMuted(): void {
    this.locallyMutedToggle.next();
  }

  public setLocalVolume(value: number): void {
    this.localVolumeAdjustment.next(value);
  }

  public commitLocalVolume(): void {
    this.localVolumeCommit.next();
  }
}

/**
 * Some participant's screen share media.
 */
export class ScreenShareViewModel extends BaseMediaViewModel {
  public constructor(
    id: string,
    member: RoomMember | undefined,
    participant: Observable<LocalParticipant | RemoteParticipant>,
    encryptionSystem: EncryptionSystem,
    livekitRoom: LivekitRoom,
    public readonly local: boolean,
  ) {
    super(
      id,
      member,
      participant,
      encryptionSystem,
      Track.Source.ScreenShareAudio,
      Track.Source.ScreenShare,
      livekitRoom,
    );
  }
}
