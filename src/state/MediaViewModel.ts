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
  AudioSource,
  TrackReferenceOrPlaceholder,
  VideoSource,
  observeParticipantEvents,
  observeParticipantMedia,
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
} from "livekit-client";
import { RoomMember, RoomMemberEvent } from "matrix-js-sdk/src/matrix";
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  distinctUntilChanged,
  distinctUntilKeyChanged,
  fromEvent,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
} from "rxjs";
import { useEffect } from "react";

import { ViewModel } from "./ViewModel";
import { useReactiveState } from "../useReactiveState";
import { alwaysShowSelf } from "../settings/settings";

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

function observeTrackReference(
  participant: Participant,
  source: Track.Source,
): Observable<TrackReferenceOrPlaceholder> {
  return observeParticipantMedia(participant).pipe(
    map(() => ({
      participant,
      publication: participant.getTrackPublication(source),
      source,
    })),
    distinctUntilKeyChanged("publication"),
    shareReplay(1),
  );
}

abstract class BaseMediaViewModel extends ViewModel {
  /**
   * Whether the media belongs to the local user.
   */
  public readonly local = this.participant.isLocal;
  /**
   * The LiveKit video track for this media.
   */
  public readonly video: Observable<TrackReferenceOrPlaceholder>;
  /**
   * Whether there should be a warning that this media is unencrypted.
   */
  public readonly unencryptedWarning: Observable<boolean>;

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
    protected readonly participant: LocalParticipant | RemoteParticipant,
    callEncrypted: boolean,
    audioSource: AudioSource,
    videoSource: VideoSource,
  ) {
    super();
    const audio = observeTrackReference(participant, audioSource);
    this.video = observeTrackReference(participant, videoSource);
    this.unencryptedWarning = combineLatest(
      [audio, this.video],
      (a, v) =>
        callEncrypted &&
        (a.publication?.isEncrypted === false ||
          v.publication?.isEncrypted === false),
    ).pipe(distinctUntilChanged(), shareReplay(1));
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
  public readonly speaking = observeParticipantEvents(
    this.participant,
    ParticipantEvent.IsSpeakingChanged,
  ).pipe(
    map((p) => p.isSpeaking),
    shareReplay(1),
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
    participant: LocalParticipant | RemoteParticipant,
    callEncrypted: boolean,
  ) {
    super(
      id,
      member,
      participant,
      callEncrypted,
      Track.Source.Microphone,
      Track.Source.Camera,
    );

    const media = observeParticipantMedia(participant).pipe(shareReplay(1));
    this.audioEnabled = media.pipe(
      map((m) => m.microphoneTrack?.isMuted === false),
    );
    this.videoEnabled = media.pipe(
      map((m) => m.cameraTrack?.isMuted === false),
    );
  }

  public toggleFitContain(): void {
    this._cropVideo.next(!this._cropVideo.value);
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
      const track = v.publication?.track;
      if (!(track instanceof LocalTrack)) return of(false);
      // Watch for track restarts, because they indicate a camera switch
      return fromEvent(track, TrackEvent.Restarted).pipe(
        startWith(null),
        // Mirror only front-facing cameras (those that face the user)
        map(() => facingModeFromLocalTrack(track).facingMode === "user"),
      );
    }),
    shareReplay(1),
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
    participant: LocalParticipant,
    callEncrypted: boolean,
  ) {
    super(id, member, participant, callEncrypted);
  }
}

/**
 * A remote participant's user media.
 */
export class RemoteUserMediaViewModel extends BaseUserMediaViewModel {
  private readonly _locallyMuted = new BehaviorSubject(false);
  /**
   * Whether we've disabled this participant's audio.
   */
  public readonly locallyMuted: Observable<boolean> = this._locallyMuted;

  private readonly _localVolume = new BehaviorSubject(1);
  /**
   * The volume to which we've set this participant's audio, as a scalar
   * multiplier.
   */
  public readonly localVolume: Observable<number> = this._localVolume;

  public constructor(
    id: string,
    member: RoomMember | undefined,
    participant: RemoteParticipant,
    callEncrypted: boolean,
  ) {
    super(id, member, participant, callEncrypted);

    // Sync the local mute state and volume with LiveKit
    combineLatest([this._locallyMuted, this._localVolume], (muted, volume) =>
      muted ? 0 : volume,
    )
      .pipe(this.scope.bind())
      .subscribe((volume) => {
        (this.participant as RemoteParticipant).setVolume(volume);
      });
  }

  public toggleLocallyMuted(): void {
    this._locallyMuted.next(!this._locallyMuted.value);
  }

  public setLocalVolume(value: number): void {
    this._localVolume.next(value);
  }
}

/**
 * Some participant's screen share media.
 */
export class ScreenShareViewModel extends BaseMediaViewModel {
  public constructor(
    id: string,
    member: RoomMember | undefined,
    participant: LocalParticipant | RemoteParticipant,
    callEncrypted: boolean,
  ) {
    super(
      id,
      member,
      participant,
      callEncrypted,
      Track.Source.ScreenShareAudio,
      Track.Source.ScreenShare,
    );
  }
}
