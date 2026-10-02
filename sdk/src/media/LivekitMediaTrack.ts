/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  observeParticipantMedia,
  roomEventSelector,
} from "@livekit/components-core";
import {
  facingModeFromLocalTrack,
  LocalTrack,
  LocalVideoTrack,
  type Participant,
  RemoteAudioTrack,
  type RemoteParticipant,
  RemoteTrack,
  type Room as LivekitRoom,
  RoomEvent,
  Track,
  TrackEvent,
  type TrackPublication,
} from "livekit-client";
import {
  distinctUntilChanged,
  fromEvent,
  interval,
  map,
  merge,
  of,
  share,
  startWith,
  switchMap,
} from "rxjs";

import { type Behavior } from "../reactive/Behavior";
import { type ObservableScope } from "../reactive/ObservableScope";
import {
  type AudioMediaTrack,
  type MediaSource,
  type MediaStreamStats,
  type MediaTrack,
  type VideoMediaTrack,
} from "../api";
import { LazyBehavior } from "../utils/LazyBehavior";

export const livekitSources: Record<MediaSource, Track.Source> = {
  microphone: Track.Source.Microphone,
  camera: Track.Source.Camera,
  screenShare: Track.Source.ScreenShare,
  screenShareAudio: Track.Source.ScreenShareAudio,
};

// One timer for every track so that a large session does not keep hundreds of
// them, each firing a statistics request, in the event loop.
const refreshStats$ = interval(1000).pipe(startWith(0), share());

/**
 * One publication of a participant as a `MediaTrack`. The publication is
 * fixed; the track behind it may come and go (a remote track arrives on
 * subscription), and every attached element follows it.
 */
export function createLivekitMediaTrack(
  scope: ObservableScope,
  participant: Participant,
  publication: TrackPublication,
  room: LivekitRoom,
  source: MediaSource,
): AudioMediaTrack | VideoMediaTrack {
  const mediaChanged$ = observeParticipantMedia(participant);
  const track$: Behavior<Track | undefined> = scope.behavior(
    merge(
      mediaChanged$,
      fromEvent(publication, TrackEvent.Subscribed),
      fromEvent(publication, TrackEvent.Unsubscribed),
    ).pipe(
      map(() => publication.track),
      startWith(publication.track),
      distinctUntilChanged(),
    ),
  );

  const attached = new Set<HTMLMediaElement>();
  let audioContext: AudioContext | undefined;
  let audioPlugins: AudioNode[] = [];
  const applyAudioContext = (track: Track | undefined): void => {
    if (!(track instanceof RemoteAudioTrack)) return;
    track.setAudioContext(audioContext);
    track.setWebAudioPlugins(audioPlugins);
  };

  let current = track$.value;
  track$.pipe(scope.bind()).subscribe((track) => {
    for (const element of attached) current?.detach(element);
    current = track;
    applyAudioContext(track);
    for (const element of attached) track?.attach(element);
  });
  scope.onEnd(() => {
    for (const element of attached) current?.detach(element);
    attached.clear();
  });

  const base: MediaTrack = {
    source,
    kind: publication.kind === Track.Kind.Audio ? "audio" : "video",
    id: publication.trackSid,
    muted$: scope.behavior(
      mediaChanged$.pipe(map(() => publication.isMuted)),
      publication.isMuted,
    ),
    encrypted$: scope.behavior(
      merge(
        mediaChanged$,
        roomEventSelector(room, RoomEvent.ParticipantEncryptionStatusChanged),
      ).pipe(map(() => publication.isEncrypted)),
      publication.isEncrypted,
    ),
    stats$: new LazyBehavior<MediaStreamStats>(
      refreshStats$.pipe(
        switchMap(async () => rtpStreamStats(publication, participant.isLocal)),
        scope.bind(),
      ),
      undefined,
    ),
    attach: (element) => {
      if (attached.has(element)) return;
      attached.add(element);
      current?.attach(element);
    },
    detach: (element) => {
      if (!attached.delete(element)) return;
      current?.detach(element);
    },
  };

  if (base.kind === "audio")
    return {
      ...base,
      kind: "audio",
      setAudioContext: (ctx, plugins = []) => {
        audioContext = ctx;
        audioPlugins = plugins;
        applyAudioContext(current);
      },
      setVolume: (volume) => {
        // Our own audio is never played back, so there is nothing to scale
        if (participant.isLocal) return;
        const remote = participant as RemoteParticipant;
        if (source === "microphone")
          remote.setVolume(volume, Track.Source.Microphone);
        else if (source === "screenShareAudio")
          remote.setVolume(volume, Track.Source.ScreenShareAudio);
      },
    };

  return {
    ...base,
    kind: "video",
    ...(participant.isLocal && { facingMode$: facingMode$(scope, track$) }),
  };
}

async function rtpStreamStats(
  publication: TrackPublication,
  local: boolean,
): Promise<MediaStreamStats> {
  const track = publication.track;
  if (!(track instanceof RemoteTrack || track instanceof LocalTrack))
    return undefined;
  const report = await track.getRTCStatsReport();
  if (!report) return undefined;
  const type = local ? "outbound-rtp" : "inbound-rtp";
  for (const stats of report.values()) if (stats.type === type) return stats;
  return undefined;
}

function facingMode$(
  scope: ObservableScope,
  track$: Behavior<Track | undefined>,
): Behavior<"user" | "environment" | undefined> {
  return scope.behavior(
    track$.pipe(
      switchMap((track) => {
        if (!(track instanceof LocalVideoTrack)) return of(undefined);
        return fromEvent(track, TrackEvent.Restarted).pipe(
          startWith(null),
          map(() => {
            const { facingMode } = facingModeFromLocalTrack(track);
            return facingMode === "user" || facingMode === "environment"
              ? facingMode
              : undefined;
          }),
        );
      }),
    ),
  );
}
