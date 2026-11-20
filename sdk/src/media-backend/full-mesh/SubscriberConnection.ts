/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  type Observable,
  of,
  Subject,
  switchMap,
} from "rxjs";
import { v4 as uuidv4 } from "uuid";

import { type MediaSource } from "../../media-api";
import { type Behavior } from "../../reactive/Behavior";
import { ObservableScope } from "../../reactive/ObservableScope";
import { MediaConnectionState } from "../api";
import {
  createFullMeshMediaTrack,
  type FullMeshMediaTrack,
  rtpStats,
  type Viewport,
} from "./MediaTrack";
import {
  type ConsumptionMetadata,
  DATA_PROTOCOL,
  isMediaPurpose,
  type MediaPurpose,
  type TrackMetadata,
} from "./metadata";
import {
  createPeerConnectionBase,
  type PeerConnectionBase,
} from "./PeerConnection";
import {
  type ConnectionMessage,
  type Peer,
  type Signalling,
} from "./signalling";

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** How long the shown size of the tracks settles before the publisher hears of it. */
const CONSUMPTION_DEBOUNCE_MS = 200;

export interface SubscriberConnection {
  /** The current attempt; null while waiting to retry. */
  current$: Behavior<PeerConnectionBase | null>;
  /** The publisher's tracks; null until its first offer is applied. */
  tracks$: Behavior<FullMeshMediaTrack[] | null>;
  /** What the publisher sent on its data channel, on any attempt. */
  data$: Observable<string>;
  /** A to-device message from the publisher; dropped unless it is for the current attempt. */
  handle(message: ConnectionMessage & { connectionId: string }): void;
}

/**
 * Our subscription to one publisher: asks it for its media and answers its
 * offers. A failed or closed attempt is retried with a fresh connection id,
 * backing off, for as long as `scope` lives.
 */
export function createSubscriberConnection({
  scope,
  peer,
  signalling,
  iceServers,
  audioOutputDeviceId$,
  logger: parentLogger,
}: {
  scope: ObservableScope;
  peer: Peer;
  signalling: Signalling;
  iceServers: () => Promise<RTCIceServer[]>;
  audioOutputDeviceId$: Behavior<string | undefined>;
  logger: Logger;
}): SubscriberConnection {
  const logger = parentLogger.getChild(`[Subscriber ← ${peer.memberId}]`);
  const attempt$ = new BehaviorSubject<Attempt | null>(null);
  const data$ = new Subject<string>();
  let retryMs = RETRY_MIN_MS;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;
  scope.onEnd(() => (ended = true));

  const startAttempt = async (): Promise<void> => {
    const servers = await iceServers();
    if (ended) return;
    const attemptScope = new ObservableScope();
    const attempt = createAttempt({
      scope: attemptScope,
      peer,
      signalling,
      iceServers: servers,
      audioOutputDeviceId$,
      onData: (text) => data$.next(text),
      onFailed: (reason) => {
        logger.info(`Attempt ${attempt.connectionId} ended: ${reason}`);
        attemptScope.end();
        if (attempt$.value === attempt) attempt$.next(null);
        if (ended) return;
        retryTimer = setTimeout(() => void startAttempt(), retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
      },
      onConnected: () => (retryMs = RETRY_MIN_MS),
      logger,
    });
    attempt$.next(attempt);
  };
  void startAttempt();
  scope.onEnd(() => {
    clearTimeout(retryTimer);
    attempt$.value?.end();
    attempt$.next(null);
    data$.complete();
  });

  return {
    current$: scope.behavior(attempt$.pipe(map((a) => a?.base ?? null))),
    tracks$: scope.behavior(
      attempt$.pipe(switchMap((a) => a?.tracks$ ?? of(null))),
    ),
    data$,
    handle: (message) => {
      if (message.connectionId === attempt$.value?.connectionId)
        attempt$.value.handle(message);
    },
  };
}

interface Attempt {
  connectionId: string;
  base: PeerConnectionBase;
  tracks$: Behavior<FullMeshMediaTrack[] | null>;
  handle(message: ConnectionMessage): void;
  end(): void;
}

interface ReceivedTrack {
  track: FullMeshMediaTrack;
  mid: string;
  scope: ObservableScope;
  source: MediaSource;
}

function createAttempt({
  scope,
  peer,
  signalling,
  iceServers,
  audioOutputDeviceId$,
  onData,
  onFailed,
  onConnected,
  logger,
}: {
  scope: ObservableScope;
  peer: Peer;
  signalling: Signalling;
  iceServers: RTCIceServer[];
  audioOutputDeviceId$: Behavior<string | undefined>;
  onData: (text: string) => void;
  onFailed: (reason: string) => void;
  onConnected: () => void;
  logger: Logger;
}): Attempt {
  const connectionId = uuidv4();
  let failed = false;
  const fail = (reason: string): void => {
    if (failed) return;
    failed = true;
    onFailed(reason);
  };
  const base = createPeerConnectionBase({
    scope,
    peer,
    connectionId,
    signalling,
    iceServers,
    onControlMessage: (message) => handle(message),
    logger,
  });
  const { pc, enqueue } = base;
  const metadata$ = new BehaviorSubject<TrackMetadata>({});
  const received$ = new BehaviorSubject<ReceivedTrack[] | null>(null);
  const wrappers = new Map<RTCRtpTransceiver, ReceivedTrack>();

  pc.addEventListener("datachannel", ({ channel }) => {
    if (channel.protocol !== DATA_PROTOCOL) return;
    channel.addEventListener("message", ({ data }: MessageEvent) => {
      if (typeof data === "string") onData(data);
    });
  });

  /** The tracks of the transceivers that receive, after each negotiation. */
  const updateTracks = (): void => {
    const metadata = metadata$.value;
    const live = new Set<RTCRtpTransceiver>();
    for (const transceiver of pc.getTransceivers()) {
      const { mid, receiver } = transceiver;
      const track = receiver.track;
      const entry = mid === null ? undefined : metadata[mid];
      if (
        transceiver.currentDirection !== "recvonly" ||
        mid === null ||
        entry === undefined ||
        !isMediaPurpose(entry.purpose)
      )
        continue;
      const kind = track.kind === "audio" ? "audio" : "video";
      const source = sourceOf(entry.purpose, kind);
      live.add(transceiver);
      const existing = wrappers.get(transceiver);
      if (existing?.source === source) continue;
      existing?.scope.end();
      const trackScope = new ObservableScope();
      wrappers.set(transceiver, {
        scope: trackScope,
        source,
        mid,
        track: createFullMeshMediaTrack(trackScope, {
          source,
          kind,
          id: `${connectionId}:${mid}`,
          track$: trackScope.behavior(of(track)),
          muted$: trackScope.behavior(
            metadata$.pipe(
              map((m) => m[mid]?.muted ?? false),
              distinctUntilChanged(),
            ),
          ),
          stats: async () => rtpStats(pc, track, "inbound-rtp"),
          audioOutputDeviceId$,
          observeViewport: true,
        }),
      });
    }
    for (const [transceiver, { scope: s }] of wrappers)
      if (!live.has(transceiver)) {
        s.end();
        wrappers.delete(transceiver);
      }
    received$.next([...wrappers.values()]);
  };

  // How the videos are shown; the first goes out once the control channel
  // is open, as everything is sent at full size until then anyway
  received$
    .pipe(
      switchMap((received) => {
        const video = (received ?? []).filter((r) => r.track.kind === "video");
        return video.length === 0
          ? of({})
          : combineLatest(video.map((r) => r.track.viewport$)).pipe(
              map((viewports) => consumptionOf(video, viewports)),
            );
      }),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      debounceTime(CONSUMPTION_DEBOUNCE_MS),
      scope.bind(),
    )
    .subscribe((metadata) =>
      base.send({
        type: "consumption_metadata",
        consumption_metadata: metadata,
      }),
    );

  base.state$
    .pipe(
      filter((s) => s instanceof Error || s === MediaConnectionState.Connected),
      scope.bind(),
    )
    .subscribe((s) => {
      if (s instanceof Error) {
        base.close("failed", true);
        fail(s.message);
      } else onConnected();
    });

  function handle(message: ConnectionMessage): void {
    switch (message.type) {
      case "description":
        if (message.description.type !== "offer") return;
        enqueue(async () => {
          if (message.track_metadata) metadata$.next(message.track_metadata);
          await pc.setRemoteDescription(message.description);
          base.openControlChannel();
          await pc.setLocalDescription(await pc.createAnswer());
          updateTracks();
          base.send({
            type: "description",
            description: { type: "answer", sdp: pc.localDescription!.sdp },
          });
        });
        break;
      case "candidates":
        base.addCandidates(message.candidates);
        break;
      case "track_metadata":
        metadata$.next(message.track_metadata);
        // A track may only become known with its metadata
        enqueue(async () => Promise.resolve(updateTracks()));
        break;
      case "close":
        base.close(message.reason, false);
        fail(`closed by the publisher: ${message.reason}`);
        break;
      default:
        logger.debug(`Ignoring ${message.type}`);
    }
  }

  scope.onEnd(() => {
    for (const { scope: s } of wrappers.values()) s.end();
    wrappers.clear();
  });

  signalling.send(peer, connectionId, { type: "subscribe" });

  return {
    connectionId,
    base,
    tracks$: scope.behavior(
      received$.pipe(map((r) => r?.map(({ track }) => track) ?? null)),
    ),
    handle,
    end: () => scope.end(),
  };
}

/**
 * The consumption metadata for the received videos, given their viewports
 * in order: a video no element shows isn't in use, and one shown at a known
 * size needs no more than that.
 */
function consumptionOf(
  video: ReceivedTrack[],
  viewports: (Viewport | null)[],
): ConsumptionMetadata {
  const metadata: ConsumptionMetadata = {};
  video.forEach(({ mid }, i) => {
    const viewport = viewports[i];
    if (viewport === null) metadata[mid] = { in_use: false };
    else if (viewport.width !== undefined && viewport.height !== undefined)
      metadata[mid] = {
        max_width: viewport.width,
        max_height: viewport.height,
      };
  });
  return metadata;
}

function sourceOf(purpose: MediaPurpose, kind: "audio" | "video"): MediaSource {
  if (purpose === "m.usermedia")
    return kind === "audio" ? "microphone" : "camera";
  return kind === "audio" ? "screenShareAudio" : "screenShare";
}
