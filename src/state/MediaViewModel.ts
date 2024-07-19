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
import { StateObservable, state } from "@react-rxjs/core";
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
import { RoomMember } from "matrix-js-sdk/src/matrix";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  distinctUntilKeyChanged,
  fromEvent,
  map,
  of,
  startWith,
  switchMap,
} from "rxjs";

import { ViewModel } from "./ViewModel";

function observeTrackReference(
  participant: Participant,
  source: Track.Source,
): StateObservable<TrackReferenceOrPlaceholder> {
  return state(
    observeParticipantMedia(participant).pipe(
      map(() => ({
        participant,
        publication: participant.getTrackPublication(source),
        source,
      })),
      distinctUntilKeyChanged("publication"),
    ),
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
  public readonly video: StateObservable<TrackReferenceOrPlaceholder>;
  /**
   * Whether there should be a warning that this media is unencrypted.
   */
  public readonly unencryptedWarning: StateObservable<boolean>;

  public constructor(
    // TODO: This is only needed for full screen toggling and can be removed as
    // soon as that code is moved into the view models
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
    this.unencryptedWarning = state(
      combineLatest(
        [audio, this.video],
        (a, v) =>
          callEncrypted &&
          (a.publication?.isEncrypted === false ||
            v.publication?.isEncrypted === false),
      ).pipe(distinctUntilChanged()),
    );
  }
}

/**
 * Some participant's media.
 */
export type MediaViewModel =
  | UserMediaViewModel
  | ScreenShareViewModel
  | MembershipOnlyViewModel;

/**
 * Some participant's user media.
 */
export class UserMediaViewModel extends BaseMediaViewModel {
  /**
   * Whether the video should be mirrored.
   */
  public readonly mirror = state(
    this.video.pipe(
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
    ),
  );

  /**
   * Whether the participant is speaking.
   */
  public readonly speaking = state(
    observeParticipantEvents(
      this.participant,
      ParticipantEvent.IsSpeakingChanged,
    ).pipe(map((p) => p.isSpeaking)),
  );

  private readonly _locallyMuted = new BehaviorSubject(false);
  /**
   * Whether we've disabled this participant's audio.
   */
  public readonly locallyMuted = state(this._locallyMuted);

  private readonly _localVolume = new BehaviorSubject(1);
  /**
   * The volume to which we've set this participant's audio, as a scalar
   * multiplier.
   */
  public readonly localVolume = state(this._localVolume);

  /**
   * Whether this participant is sending audio (i.e. is unmuted on their side).
   */
  public readonly audioEnabled: StateObservable<boolean>;
  /**
   * Whether this participant is sending video.
   */
  public readonly videoEnabled: StateObservable<boolean>;

  private readonly _cropVideo = new BehaviorSubject(true);
  /**
   * Whether the tile video should be contained inside the tile or be cropped to fit.
   */
  public readonly cropVideo = state(this._cropVideo);

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

    const media = observeParticipantMedia(participant);
    this.audioEnabled = state(
      media.pipe(map((m) => m.microphoneTrack?.isMuted === false)),
    );
    this.videoEnabled = state(
      media.pipe(map((m) => m.cameraTrack?.isMuted === false)),
    );

    // Sync the local mute state and volume with LiveKit
    if (!this.local)
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

  public toggleFitContain(): void {
    this._cropVideo.next(!this._cropVideo.value);
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

/**
 * Placeholder for a call membership that does not have a LiveKit participant associated with it.
 */
export class MembershipOnlyViewModel extends ViewModel {
  public id: string;
  public local = false;
  public constructor(public readonly member: RoomMember) {
    super();
    this.id = member.userId;
  }
}
