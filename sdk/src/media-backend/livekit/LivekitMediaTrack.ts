/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  observeParticipantEvents,
  observeParticipantMedia,
} from "@livekit/components-core";
import {
  facingModeFromLocalTrack,
  type LocalParticipant,
  LocalTrack,
  LocalVideoTrack,
  type Participant,
  ParticipantEvent,
  RemoteAudioTrack,
  RemoteTrack,
  type Room as LivekitRoom,
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

import { type Behavior } from "../../reactive/Behavior";
import { type ObservableScope } from "../../reactive/ObservableScope";
import {
  type AudioMediaTrack,
  type LocalAudioMediaTrack,
  type LocalVideoMediaTrack,
  type MediaSource,
  type MediaStreamStats,
  type MediaTrack,
  type VideoMediaTrack,
} from "../../media-api";
import { MatrixRTCError } from "../../errors";
import { LazyBehavior } from "../../utils/LazyBehavior";
import { convertToLivekitProcessor } from "./videoProcessor";

export const mediaSources: Record<Track.Source, MediaSource> = {
  [Track.Source.Microphone]: "microphone",
  [Track.Source.Camera]: "camera",
  [Track.Source.ScreenShare]: "screenShare",
  [Track.Source.ScreenShareAudio]: "screenShareAudio",
  [Track.Source.Unknown]: "unknown",
};

export const livekitSources: Record<MediaSource, Track.Source> = {
  microphone: Track.Source.Microphone,
  camera: Track.Source.Camera,
  screenShare: Track.Source.ScreenShare,
  screenShareAudio: Track.Source.ScreenShareAudio,
  unknown: Track.Source.Unknown,
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
): AudioMediaTrack | VideoMediaTrack {
  const mediaChanged$ = observeParticipantMedia(participant);
  const track$ = publicationTrack$(scope, participant, publication);

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
    source: mediaSources[publication.source],
    kind: publication.kind === Track.Kind.Audio ? "audio" : "video",
    id: publication.trackSid,
    muted$,
    encrypted: publication.isEncrypted,
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

  return { ...base, kind: "video" };
}

/**
 * One of our own publications, with the controls over it. `setEnabled` goes
 * through the local member so that what it remembers for a reconnection
 * stays in step.
 */
export function createLocalLivekitMediaTrack(
  scope: ObservableScope,
  participant: LocalParticipant,
  publication: TrackPublication,
  room: LivekitRoom,
  setEnabled: (source: MediaSource, enabled: boolean) => Promise<boolean>,
): LocalAudioMediaTrack | LocalVideoMediaTrack {
  const base = createLivekitMediaTrack(scope, participant, publication);
  const local = {
    setEnabled: async (enabled: boolean) => setEnabled(base.source, enabled),
    setDevice: async (deviceId: string): Promise<void> => {
      if (base.source !== "microphone" && base.source !== "camera")
        throw new MatrixRTCError(`A ${base.source} track has no device`);
      await room.switchActiveDevice(
        base.kind === "audio" ? "audioinput" : "videoinput",
        deviceId,
      );
    },
  };
  if (base.kind === "audio") return { ...base, ...local };

  const videoTrack = (): LocalVideoTrack | undefined =>
    publication.track instanceof LocalVideoTrack
      ? publication.track
      : undefined;
  return {
    ...base,
    ...local,
    facingMode$: facingMode$(
      scope,
      publicationTrack$(scope, participant, publication),
    ),
    switchFacingMode: async () => {
      const track = videoTrack();
      if (!track) return;
      const { facingMode } = facingModeFromLocalTrack(track);
      if (facingMode !== "user" && facingMode !== "environment") return;
      await track.restartTrack({
        facingMode: facingMode === "user" ? "environment" : "user",
      });
      return track.mediaStreamTrack.getSettings().deviceId;
    },
    setProcessor: async (processor) => {
      const track = videoTrack();
      // A processor cannot be built on a track that has already ended
      if (!track || track.mediaStreamTrack.readyState === "ended") return;
      if (processor)
        await track.setProcessor(convertToLivekitProcessor(processor));
      else if (track.getProcessor()) await track.stopProcessor();
    },
  };
}

/** The track behind a publication; a remote one arrives on subscription. */
function publicationTrack$(
  scope: ObservableScope,
  participant: Participant,
  publication: TrackPublication,
): Behavior<Track | undefined> {
  return scope.behavior(
    merge(
      observeParticipantMedia(participant),
      fromEvent(publication, TrackEvent.Subscribed),
      fromEvent(publication, TrackEvent.Unsubscribed),
    ).pipe(
      map(() => publication.track),
      startWith(publication.track),
      distinctUntilChanged(),
    ),
  );
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
