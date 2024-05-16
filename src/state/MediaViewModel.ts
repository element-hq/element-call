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
import { RoomMember, RoomMemberEvent } from "matrix-js-sdk/src/matrix";
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
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

import { ViewModel } from "./ViewModel";
import { useReactiveState } from "../useReactiveState";

export interface NameData {
  /**
   * The display name of the participant.
   */
  displayName: string;
  /**
   * The text to be shown on the participant's name tag.
   */
  nameTag: string;
}

// TODO: Move this naming logic into the view model
export function useNameData(vm: MediaViewModel): NameData {
  const { t } = useTranslation();

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
  const nameTag = vm.local
    ? t("video_tile.sfu_participant_local")
    : displayName;

  return { displayName, nameTag };
}

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
  public readonly speaking = state(
    observeParticipantEvents(
      this.participant,
      ParticipantEvent.IsSpeakingChanged,
    ).pipe(map((p) => p.isSpeaking)),
  );

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
  public readonly locallyMuted = state(this._locallyMuted);

  private readonly _localVolume = new BehaviorSubject(1);
  /**
   * The volume to which we've set this participant's audio, as a scalar
   * multiplier.
   */
  public readonly localVolume = state(this._localVolume);

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
