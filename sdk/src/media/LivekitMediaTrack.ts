/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  observeParticipantEvents,
  observeParticipantMedia,
  roomEventSelector,
} from "@livekit/components-core";
import {
  facingModeFromLocalTrack,
  LocalTrack,
  LocalVideoTrack,
  type Participant,
  ParticipantEvent,
  RemoteAudioTrack,
  RemoteTrack,
  type Room as LivekitRoom,
  RoomEvent,
  Track,
  TrackEvent,
  type TrackPublication,
} from "livekit-client";
import {
  combineLatest,
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

const sources: Record<Track.Source, MediaSource> = {
  [Track.Source.Microphone]: "microphone",
  [Track.Source.Camera]: "camera",
  [Track.Source.ScreenShare]: "screenShare",
  [Track.Source.ScreenShareAudio]: "screenShareAudio",
  [Track.Source.Unknown]: "unknown",
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
  let volume: number | undefined;
  const applyAudioSettings = (track: Track | undefined): void => {
    if (!(track instanceof RemoteAudioTrack)) return;
    track.setAudioContext(audioContext);
    track.setWebAudioPlugins(audioPlugins);
    if (volume !== undefined) track.setVolume(volume);
  };

  let current = track$.value;
  track$.pipe(scope.bind()).subscribe((track) => {
    for (const element of attached) current?.detach(element);
    current = track;
    applyAudioSettings(track);
    for (const element of attached) track?.attach(element);
  });
  scope.onEnd(() => {
    for (const element of attached) current?.detach(element);
    attached.clear();
  });

  const muted$ = scope.behavior(
    mediaChanged$.pipe(map(() => publication.isMuted)),
    publication.isMuted,
  );
  const base: MediaTrack = {
    source: sources[publication.source],
    kind: publication.kind === Track.Kind.Audio ? "audio" : "video",
    id: publication.trackSid,
    muted$,
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
      // LiveKit detects speakers per participant, so this is the member's
      // activity, narrowed to the tracks that can be carrying it
      isActive$: scope.behavior(
        combineLatest(
          [
            observeParticipantEvents(
              participant,
              ParticipantEvent.IsSpeakingChanged,
            ).pipe(map((p) => p.isSpeaking)),
            muted$,
          ],
          (speaking, muted) => speaking && !muted,
        ),
        participant.isSpeaking && !publication.isMuted,
      ),
      setAudioContext: (ctx, plugins = []) => {
        audioContext = ctx;
        audioPlugins = plugins;
        applyAudioSettings(current);
      },
      setVolume: (v) => {
        // Our own audio is never played back, so there is nothing to scale
        volume = v;
        applyAudioSettings(current);
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
