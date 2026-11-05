/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  map,
  Observable,
  of,
  scan,
  switchMap,
  timer,
} from "rxjs";

import { type Behavior, constant } from "../../reactive/Behavior";
import { type ObservableScope } from "../../reactive/ObservableScope";
import {
  type AudioMediaTrack,
  type MediaSource,
  type MediaStreamStats,
  type MediaTrack,
  type VideoMediaTrack,
} from "../../media-api";

export interface TrackProps {
  source: MediaSource;
  kind: "audio" | "video";
  id: string;
  /** The track behind it; may change, as on a device switch, or be null while off. */
  track$: Behavior<MediaStreamTrack | null>;
  muted$: Behavior<boolean>;
  /** Statistics of the RTP stream carrying it, if there is one. */
  stats: () => Promise<MediaStreamStats>;
  /** Where attached elements play; only for tracks that are played. */
  audioOutputDeviceId$?: Behavior<string | undefined>;
  /** Whether to follow where attached video elements are shown, for `viewport$`. */
  observeViewport?: boolean;
}

/** Where a video is shown: the largest of its visible elements, in device pixels if known. */
export interface Viewport {
  width?: number;
  height?: number;
}

export type FullMeshMediaTrack = (AudioMediaTrack | VideoMediaTrack) & {
  /** Null while no attached element is visible; always null unless observed. */
  viewport$: Behavior<Viewport | null>;
};

/** Above this level a track turns active; below `INACTIVE_LEVEL` for `INACTIVE_AFTER_MS` it turns inactive. */
const ACTIVE_LEVEL = 0.04;
const INACTIVE_LEVEL = 0.02;
const LEVEL_INTERVAL_MS = 100;
const INACTIVE_AFTER_MS = 500;

let levelContext: AudioContext | undefined;

/**
 * A `MediaStreamTrack` as a `MediaTrack`: the same object for the life of a
 * publication, with every attached element following the track behind it.
 */
export function createFullMeshMediaTrack(
  scope: ObservableScope,
  props: TrackProps,
): FullMeshMediaTrack {
  const { source, kind, id, track$, muted$, stats, audioOutputDeviceId$ } =
    props;
  const attached = new Set<HTMLMediaElement>();
  const viewport =
    kind === "video" && props.observeViewport
      ? observeViewport(scope)
      : undefined;
  let audioContext: AudioContext | undefined;
  let audioPlugins: AudioNode[] = [];
  let volume = 1;
  let webAudio: { nodes: AudioNode[]; gain: GainNode } | undefined;

  const routeWebAudio = (track: MediaStreamTrack | null): void => {
    for (const node of webAudio?.nodes ?? []) node.disconnect();
    webAudio = undefined;
    if (audioContext === undefined || track === null) return;
    const input = audioContext.createMediaStreamSource(
      new MediaStream([track]),
    );
    const gain = audioContext.createGain();
    gain.gain.value = volume;
    const chain: AudioNode[] = [input, ...audioPlugins, gain];
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
    gain.connect(audioContext.destination);
    webAudio = { nodes: chain, gain };
  };

  const apply = (element: HTMLMediaElement): void => {
    const track = track$.value;
    element.srcObject = track ? new MediaStream([track]) : null;
    if (kind === "audio") {
      // Played through Web Audio instead, where it is routed there
      element.muted = audioContext !== undefined;
      element.volume = volume;
      const sinkId = audioOutputDeviceId$?.value;
      if (sinkId !== undefined && "setSinkId" in element)
        void element.setSinkId(sinkId).catch(() => {});
    }
    if (element.paused) void element.play().catch(() => {});
  };

  track$.pipe(scope.bind()).subscribe((track) => {
    for (const element of attached) apply(element);
    if (kind === "audio") routeWebAudio(track);
  });
  audioOutputDeviceId$?.pipe(scope.bind()).subscribe(() => {
    for (const element of attached) apply(element);
  });
  scope.onEnd(() => {
    for (const element of attached) element.srcObject = null;
    attached.clear();
    routeWebAudio(null);
  });

  const base: MediaTrack = {
    source,
    kind,
    id,
    muted$,
    // DTLS-SRTP, its fingerprints exchanged over Olm
    encrypted: true,
    stats$: (intervalMs): Observable<MediaStreamStats> =>
      timer(0, intervalMs).pipe(
        switchMap(async () => stats()),
        scope.bind(),
      ),
    attach: (element) => {
      if (attached.has(element)) return;
      attached.add(element);
      apply(element);
      viewport?.observe(element);
    },
    detach: (element) => {
      if (!attached.delete(element)) return;
      element.srcObject = null;
      viewport?.unobserve(element);
    },
  };

  if (kind === "video")
    return {
      ...base,
      kind: "video",
      viewport$: viewport?.viewport$ ?? constant(null),
    };

  const audioLevel$ = scope.behavior(
    combineLatest([track$, muted$]).pipe(
      switchMap(([track, muted]) =>
        track === null || muted ? of(0) : level$(track),
      ),
    ),
    0,
  );
  const isActive$ = scope.behavior(
    audioLevel$.pipe(
      scan(
        ({ active, quietMs }, level) => {
          if (level >= ACTIVE_LEVEL) return { active: true, quietMs: 0 };
          if (level >= INACTIVE_LEVEL) return { active, quietMs: 0 };
          const quiet = quietMs + LEVEL_INTERVAL_MS;
          return {
            active: active && quiet < INACTIVE_AFTER_MS,
            quietMs: quiet,
          };
        },
        { active: false, quietMs: 0 },
      ),
      map(({ active }) => active),
      distinctUntilChanged(),
    ),
    false,
  );

  return {
    ...base,
    kind: "audio",
    viewport$: constant(null),
    audioLevel$,
    isActive$,
    setAudioContext: (ctx, plugins = []) => {
      audioContext = ctx;
      audioPlugins = plugins;
      routeWebAudio(track$.value);
      for (const element of attached) apply(element);
    },
    setVolume: (v) => {
      volume = v;
      if (webAudio) webAudio.gain.gain.value = v;
      for (const element of attached) element.volume = v;
    },
  };
}

/**
 * Follows the size and visibility of elements. Where the platform has no
 * observers, an element counts as visible at an unknown size.
 */
function observeViewport(scope: ObservableScope): {
  viewport$: Behavior<Viewport | null>;
  observe: (element: Element) => void;
  unobserve: (element: Element) => void;
} {
  const shown = new Map<
    Element,
    { visible: boolean; width?: number; height?: number }
  >();
  const viewport$ = new BehaviorSubject<Viewport | null>(null);
  const update = (): void => {
    const visible = [...shown.values()].filter(
      ({ visible, width, height }) => visible && width !== 0 && height !== 0,
    );
    // One element of unknown size leaves the size unknown
    const next: Viewport | null =
      visible.length === 0
        ? null
        : visible.some((e) => e.width === undefined || e.height === undefined)
          ? {}
          : {
              width: Math.max(...visible.map((e) => e.width!)),
              height: Math.max(...visible.map((e) => e.height!)),
            };
    const current = viewport$.value;
    if (
      (current === null) !== (next === null) ||
      current?.width !== next?.width ||
      current?.height !== next?.height
    )
      viewport$.next(next);
  };

  const pixelRatio = globalThis.devicePixelRatio ?? 1;
  const resizes =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver((entries) => {
          for (const { target, contentRect } of entries) {
            const entry = shown.get(target);
            if (entry === undefined) continue;
            entry.width = Math.ceil(contentRect.width * pixelRatio);
            entry.height = Math.ceil(contentRect.height * pixelRatio);
          }
          update();
        });
  const intersections =
    typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver((entries) => {
          for (const { target, isIntersecting } of entries) {
            const entry = shown.get(target);
            if (entry !== undefined) entry.visible = isIntersecting;
          }
          update();
        });
  scope.onEnd(() => {
    resizes?.disconnect();
    intersections?.disconnect();
  });

  return {
    viewport$: scope.behavior(viewport$),
    observe: (element): void => {
      // Visible until the observers say otherwise, so that nothing is paused
      // before they first report
      shown.set(element, { visible: true });
      resizes?.observe(element);
      intersections?.observe(element);
      update();
    },
    unobserve: (element): void => {
      shown.delete(element);
      resizes?.unobserve(element);
      intersections?.unobserve(element);
      update();
    },
  };
}

/** The RMS level of an audio track, 0 to 1, sampled while subscribed. */
function level$(track: MediaStreamTrack): Observable<number> {
  return new Observable<number>((subscriber) => {
    levelContext ??= new AudioContext();
    const ctx = levelContext;
    const input = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    input.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const sub = timer(0, LEVEL_INTERVAL_MS).subscribe(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      subscriber.next(Math.min(1, Math.sqrt(sum / samples.length) * 4));
    });
    return () => {
      sub.unsubscribe();
      input.disconnect();
    };
  });
}

/** The inbound or outbound RTP statistics of one track on a peer connection. */
export async function rtpStats(
  pc: RTCPeerConnection | undefined,
  track: MediaStreamTrack | null,
  direction: "inbound-rtp" | "outbound-rtp",
): Promise<MediaStreamStats> {
  if (pc === undefined || track === null) return undefined;
  const report = await pc.getStats(track);
  for (const stats of report.values())
    if ((stats as RTCStats).type === direction)
      return stats as RTCInboundRtpStreamStats & RTCOutboundRtpStreamStats;
  return undefined;
}
