/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  BehaviorSubject,
  combineLatest,
  filter,
  firstValueFrom,
  map,
  NEVER,
  of,
  switchMap,
} from "rxjs";
import { v4 as uuidv4 } from "uuid";

import { MatrixRTCError, toMatrixRTCError } from "../../errors";
import {
  type LocalAudioMediaTrack,
  type LocalVideoMediaTrack,
  type MediaSource,
  type PublishRequest,
  type VideoProcessor,
} from "../../media-api";
import { type Behavior } from "../../reactive/Behavior";
import { ObservableScope } from "../../reactive/ObservableScope";
import { type LocalMediaBackend, type MediaConnectionState } from "../api";
import { createFullMeshMediaTrack, rtpStats } from "./MediaTrack";
import { type StreamMetadata } from "./metadata";

type PublishedSource = Exclude<MediaSource, "unknown">;

/** One local track as the publisher connections send it. */
export interface LocalPublication {
  source: PublishedSource;
  kind: "audio" | "video";
  /**
   * The `MediaStream` it is sent in: one for the user media, one for the
   * screen share. Its id is the `msid` the stream metadata is keyed by.
   */
  stream: MediaStream;
  /** What goes on the wire; null while the source is off. */
  track$: Behavior<MediaStreamTrack | null>;
  mediaTrack: LocalAudioMediaTrack | LocalVideoMediaTrack;
}

export interface FullMeshLocalMedia extends LocalMediaBackend {
  /** Every local track, once the first `setPublishing(true)` started the capture. */
  publications$: Behavior<LocalPublication[]>;
  /** Whether the tracks reach the publisher connections. */
  publishing$: Behavior<boolean>;
  streamMetadata$: Behavior<StreamMetadata>;
}

interface Props {
  scope: ObservableScope;
  publish: PublishRequest[];
  connectionState$: Behavior<MediaConnectionState | Error>;
  /** The publisher connections, for the outbound statistics of a track. */
  peerConnections: () => RTCPeerConnection[];
  logger: Logger;
}

interface Capture {
  /** What was captured, before any processor. */
  raw: MediaStreamTrack;
  out: MediaStreamTrack;
}

/** The local member's side: capture, the publication list and the controls. */
export function createFullMeshLocalMedia({
  scope,
  publish: initialRequests,
  connectionState$,
  peerConnections,
  logger: parentLogger,
}: Props): FullMeshLocalMedia {
  const logger = parentLogger.getChild("[LocalMedia]");
  // Only their ids matter: the tracks are added per connection
  const userMediaStream = new MediaStream();
  const screenShareStream = new MediaStream();
  const desired = new Map<PublishRequest["source"], PublishRequest>(
    initialRequests.map((r) => [r.source, r]),
  );
  const started$ = new BehaviorSubject(false);
  const publishing$ = new BehaviorSubject(false);
  const publishError$ = new BehaviorSubject<Error | null>(null);
  const publications$ = new BehaviorSubject<LocalPublication[]>([]);
  const teardowns = new Map<PublishedSource, () => void>();

  const statsFor = async (track: MediaStreamTrack | null) => {
    for (const pc of peerConnections())
      if (pc.getSenders().some((s) => s.track === track && track !== null))
        return rtpStats(pc, track, "outbound-rtp");
    return undefined;
  };

  /** Adds a publication whose track is managed by `control`. */
  const addPublication = (
    source: PublishedSource,
    kind: "audio" | "video",
    stream: MediaStream,
    initial: MediaStreamTrack,
    control: {
      setEnabled: (
        enabled: boolean,
        track$: BehaviorSubject<MediaStreamTrack | null>,
      ) => Promise<boolean>;
      setDevice?: (
        deviceId: string,
        track$: BehaviorSubject<MediaStreamTrack | null>,
      ) => Promise<void>;
      switchFacingMode?: (
        track$: BehaviorSubject<MediaStreamTrack | null>,
      ) => Promise<string | undefined>;
      setProcessor?: (
        p: VideoProcessor | undefined,
        track$: BehaviorSubject<MediaStreamTrack | null>,
      ) => Promise<void>;
      stop: () => void;
    },
  ): LocalPublication => {
    const pubScope = new ObservableScope();
    const track$ = new BehaviorSubject<MediaStreamTrack | null>(initial);
    const enabled$ = new BehaviorSubject(true);
    const base = createFullMeshMediaTrack(pubScope, {
      source,
      kind,
      id: uuidv4(),
      track$,
      muted$: pubScope.behavior(enabled$.pipe(map((e) => !e))),
      stats: async () => statsFor(track$.value),
    });
    const local = {
      setEnabled: async (enabled: boolean): Promise<boolean> => {
        const result = await control.setEnabled(enabled, track$);
        enabled$.next(result);
        return result;
      },
      setDevice: async (deviceId: string): Promise<void> => {
        if (!control.setDevice)
          throw new MatrixRTCError(`A ${source} track has no device`);
        await control.setDevice(deviceId, track$);
      },
    };
    const mediaTrack =
      base.kind === "audio"
        ? { ...base, ...local }
        : {
            ...base,
            ...local,
            facingMode$: pubScope.behavior(
              track$.pipe(map((t) => facingModeOf(t))),
            ),
            switchFacingMode: async () => control.switchFacingMode?.(track$),
            setProcessor: async (p: VideoProcessor | undefined) =>
              control.setProcessor?.(p, track$),
          };
    const publication: LocalPublication = {
      source,
      kind,
      stream,
      track$,
      mediaTrack: mediaTrack as LocalAudioMediaTrack | LocalVideoMediaTrack,
    };
    publications$.next([...publications$.value, publication]);
    teardowns.set(source, () => {
      control.stop();
      track$.value?.stop();
      pubScope.end();
      publications$.next(publications$.value.filter((p) => p !== publication));
      teardowns.delete(source);
    });
    return publication;
  };

  const captureMicrophone = async (
    request: Extract<PublishRequest, { source: "microphone" }>,
  ): Promise<void> => {
    const track = await getTrack({
      audio: { deviceId: exact(request.deviceId), ...request.capture },
    });
    addPublication("microphone", "audio", userMediaStream, track, {
      // Muting a microphone keeps the device: unmuting is instant
      setEnabled: async (enabled, track$) => {
        if (track$.value) track$.value.enabled = enabled;
        return Promise.resolve(enabled);
      },
      setDevice: async (deviceId, track$) => {
        const next = await getTrack({
          audio: { deviceId: { exact: deviceId }, ...request.capture },
        });
        next.enabled = track$.value?.enabled ?? true;
        track$.value?.stop();
        track$.next(next);
      },
      stop: () => {},
    });
  };

  const captureCamera = async (
    request: Extract<PublishRequest, { source: "camera" }>,
  ): Promise<void> => {
    let deviceId = request.deviceId;
    let facingMode: string | undefined;
    let processor = request.processor;
    let capture: Capture | null = null;
    let processorStarted = false;
    const constraints = (): MediaTrackConstraints => ({
      deviceId: exact(deviceId),
      facingMode,
      width: request.capture?.resolution?.width,
      height: request.capture?.resolution?.height,
      frameRate: request.capture?.resolution?.frameRate,
    });
    const open = async (): Promise<Capture> => {
      const raw = await getTrack({ video: constraints() });
      if (processor === undefined) return { raw, out: raw };
      const out = processorStarted
        ? await processor.restart(raw)
        : await processor.init(raw);
      processorStarted = true;
      return { raw, out };
    };
    const close = (): void => {
      capture?.raw.stop();
      if (capture?.out !== capture?.raw) capture?.out.stop();
      capture = null;
    };
    // Reopens the camera with the current settings, if it is on
    const reopen = async (
      track$: BehaviorSubject<MediaStreamTrack | null>,
    ): Promise<void> => {
      if (capture === null) return;
      close();
      capture = await open();
      track$.next(capture.out);
    };
    capture = await open();
    addPublication("camera", "video", userMediaStream, capture.out, {
      // Muting a camera releases it, so that its light goes off
      setEnabled: async (enabled, track$) => {
        if (enabled === (capture !== null)) return enabled;
        if (!enabled) {
          close();
          track$.next(null);
          return false;
        }
        try {
          capture = await open();
          track$.next(capture.out);
          return true;
        } catch (e) {
          logger.warn("Could not reopen the camera", e);
          return false;
        }
      },
      setDevice: async (id, track$) => {
        deviceId = id;
        facingMode = undefined;
        await reopen(track$);
      },
      switchFacingMode: async (track$) => {
        const current = facingModeOf(track$.value);
        if (current === undefined) return undefined;
        deviceId = undefined;
        facingMode = current === "user" ? "environment" : "user";
        await reopen(track$);
        return capture?.raw.getSettings().deviceId;
      },
      setProcessor: async (p, track$) => {
        await processor?.destroy();
        processor = p;
        processorStarted = false;
        if (capture === null) return;
        const out = p ? await p.init(capture.raw) : capture.raw;
        processorStarted = p !== undefined;
        if (capture.out !== capture.raw) capture.out.stop();
        capture = { raw: capture.raw, out };
        track$.next(out);
      },
      stop: () => {
        close();
        void processor?.destroy();
      },
    });
  };

  const captureScreen = async (
    request: Extract<PublishRequest, { source: "screenShare" }>,
  ): Promise<void> => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: request.capture?.resolution?.width,
        height: request.capture?.resolution?.height,
        frameRate: request.capture?.resolution?.frameRate,
      },
      audio: request.audio ?? true,
    });
    const [video] = stream.getVideoTracks();
    const [audio] = stream.getAudioTracks();
    const toggle = async (
      enabled: boolean,
      track$: BehaviorSubject<MediaStreamTrack | null>,
    ): Promise<boolean> => {
      if (track$.value) track$.value.enabled = enabled;
      return Promise.resolve(enabled);
    };
    addPublication("screenShare", "video", screenShareStream, video, {
      setEnabled: toggle,
      // The audio goes with its video
      stop: () => {
        audio?.stop();
        teardowns.get("screenShareAudio")?.();
      },
    });
    if (audio)
      addPublication("screenShareAudio", "audio", screenShareStream, audio, {
        setEnabled: toggle,
        stop: () => {},
      });
    // Stopped from the browser's own controls
    video.addEventListener("ended", () => void unpublish("screenShare"));
  };

  const capture = async (request: PublishRequest): Promise<void> => {
    teardowns.get(request.source)?.();
    switch (request.source) {
      case "microphone":
        return captureMicrophone(request);
      case "camera":
        return captureCamera(request);
      case "screenShare":
        return captureScreen(request);
    }
  };

  const start = async (): Promise<void> => {
    for (const request of desired.values())
      await capture(request).catch((e: unknown) => {
        logger.warn(`Could not capture ${request.source}`, e);
        if (publishError$.value === null)
          publishError$.next(toMatrixRTCError(e));
      });
  };

  const setPublishing = (publish: boolean): void => {
    publishing$.next(publish);
    if (publish && !started$.value) {
      started$.next(true);
      void start();
    }
  };

  const publish = async (
    request: PublishRequest,
  ): Promise<LocalAudioMediaTrack | LocalVideoMediaTrack> => {
    desired.set(request.source, request);
    try {
      // Before the start, the start captures everything desired itself
      if (started$.value) await capture(request);
      return await firstValueFrom(
        publications$.pipe(
          map((ps) => ps.find((p) => p.source === request.source)),
          filter((p) => p !== undefined),
          map((p) => p.mediaTrack),
        ),
      );
    } catch (e) {
      desired.delete(request.source);
      throw toMatrixRTCError(e);
    }
  };

  const unpublish = async (source: MediaSource): Promise<void> => {
    const published = source === "screenShareAudio" ? "screenShare" : source;
    if (published === "unknown") return;
    desired.delete(published);
    teardowns.get(published)?.();
    return Promise.resolve();
  };

  scope.onEnd(() => {
    // Each teardown removes itself from the map
    for (const teardown of Array.from(teardowns.values())) teardown();
  });

  const tracks$ = scope.behavior(
    combineLatest([started$, publications$]).pipe(
      map(([started, ps]) => (started ? ps.map((p) => p.mediaTrack) : null)),
    ),
  );

  const streamMetadata$ = scope.behavior(
    publications$.pipe(
      switchMap((ps) =>
        ps.length === 0
          ? of([])
          : combineLatest(
              ps.map((p) =>
                p.mediaTrack.muted$.pipe(map((muted) => ({ p, muted }))),
              ),
            ),
      ),
      map((entries) => {
        const metadata: StreamMetadata = {};
        for (const { p, muted } of entries) {
          const entry = (metadata[p.stream.id] ??= {
            purpose:
              p.stream === userMediaStream ? "m.usermedia" : "m.screenshare",
          });
          if (p.kind === "audio") entry.audio_muted = muted;
          else entry.video_muted = muted;
        }
        return metadata;
      }),
    ),
  );

  return {
    connectionState$,
    tracks$,
    encryptionError$: NEVER,
    setPublishing,
    publishError$,
    publish,
    unpublish,
    publications$,
    publishing$,
    streamMetadata$,
  };
}

function exact(deviceId: string | undefined): ConstrainDOMString | undefined {
  return deviceId === undefined ? undefined : { exact: deviceId };
}

async function getTrack(
  constraints: MediaStreamConstraints,
): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const [track] = stream.getTracks();
  if (track === undefined) throw new MatrixRTCError("No track was captured");
  return track;
}

function facingModeOf(
  track: MediaStreamTrack | null,
): "user" | "environment" | undefined {
  const mode = track?.getSettings().facingMode;
  return mode === "user" || mode === "environment" ? mode : undefined;
}
