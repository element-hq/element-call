/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useRef, useState } from "react";
import {
  createLocalVideoTrack,
  type LocalVideoTrack,
  VideoPresets,
} from "livekit-client";
import {
  BackgroundProcessorWrapper,
  supportsBackgroundProcessors as supportsBackgroundProcessorsLivekitSdk,
  supportsModernBackgroundProcessors,
  type SwitchBackgroundProcessorOptions,
} from "@livekit/track-processors";
import { logger } from "matrix-js-sdk/lib/logger";

import { BackgroundEffectTransformer } from "./BackgroundEffectTransformer";
import { blurRadius, imagePathFor } from "./backgroundEffects";
import { supportsBackgroundProcessors } from "./backgroundProcessing";
import { platform } from "../Platform";

/**
 * Whether background effects can hold their frame rate on this device, asked
 * without a call in the way.
 *
 * The camera and the pipeline only: no SFU, no encoder, no second participant.
 * If a device cannot hold a frame rate here it cannot hold one in a call
 * either, so this is the cheap half of the question — and it is the half that
 * has never been asked. The gate that keeps effects off phones was added from
 * reports, not measurements, and nothing in the app will run the pipeline
 * there, so there has been nothing to measure.
 *
 * Deliberately ignores that gate: measuring what it forbids is the point. It
 * reports what the gate would have said, and runs anyway.
 *
 * Exploration only, and never ported: an unlisted route, its text not
 * translated, its numbers meant for whoever is holding the phone.
 */

type Effect = "none" | "blur" | "image";

interface Bucket {
  /** Seconds since the first frame. */
  at: number;
  fps: number;
}

interface Run {
  effect: Effect;
  device: string;
  platform: string;
  /** Whether the browser has the API that avoids the canvas fallback. */
  modernApi: boolean;
  /** What the app's own verdict would have said about this device. */
  appWouldAllow: boolean;
  sdkWouldAllow: boolean;
  capture: { width?: number; height?: number; frameRate?: number };
  processed: { width?: number; height?: number; frameRate?: number };
  /** Milliseconds from asking for the effect to the first frame carrying it. */
  startupMs: number | null;
  meanFps: number;
  /** The worst five-second stretch — where throttling shows up first. */
  worstFps: number;
  buckets: Bucket[];
  /** Worst observed delay on a 100ms timer: the main thread's own stutter. */
  worstTimerLagMs: number;
  frames: number;
  seconds: number;
}

const bucketSeconds = 5;

function optionsFor(effect: Effect): SwitchBackgroundProcessorOptions {
  switch (effect) {
    case "blur":
      return { mode: "background-blur", blurRadius };
    case "image": {
      const imagePath = imagePathFor("indoor");
      return imagePath
        ? { mode: "virtual-background", imagePath }
        : { mode: "disabled" };
    }
    default:
      return { mode: "disabled" };
  }
}

export const BackgroundEffectsBench: FC = () => {
  const video = useRef<HTMLVideoElement | null>(null);
  const [seconds, setSeconds] = useState(60);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [runs, setRuns] = useState<Run[]>([]);

  const measure = useCallback(
    async (effect: Effect): Promise<void> => {
      setBusy(true);
      setStatus(`Starting the camera for "${effect}"…`);
      let track: LocalVideoTrack | undefined;
      try {
        // The resolution and frame rate a real call captures at, so the cost
        // measured here is the cost a call would pay.
        track = await createLocalVideoTrack({
          resolution: VideoPresets.h720.resolution,
        });
        const capture = track.mediaStreamTrack.getSettings();

        let startupMs: number | null = null;
        if (effect !== "none") {
          setStatus("Starting the pipeline…");
          const askedAt = performance.now();
          const pipeline = new BackgroundProcessorWrapper(
            new BackgroundEffectTransformer({ backgroundDisabled: true }),
            "background-effect-bench",
          );
          await track.setProcessor(pipeline);
          await pipeline.switchTo(optionsFor(effect));
          startupMs = Math.round(performance.now() - askedAt);
        }

        const element = video.current!;
        track.attach(element);
        await element.play().catch(() => undefined);

        setStatus(`Measuring "${effect}" for ${seconds}s…`);
        const result = await countFrames(element, seconds, (done) =>
          setStatus(`Measuring "${effect}": ${done}s of ${seconds}s`),
        );

        const processed = track.mediaStreamTrack.getSettings();
        setRuns((previous) => [
          ...previous,
          {
            effect,
            device: navigator.userAgent,
            platform,
            modernApi: supportsModernBackgroundProcessors(),
            appWouldAllow: supportsBackgroundProcessors(),
            sdkWouldAllow: supportsBackgroundProcessorsLivekitSdk(),
            capture: {
              width: capture.width,
              height: capture.height,
              frameRate: capture.frameRate,
            },
            processed: {
              width: processed.width,
              height: processed.height,
              frameRate: processed.frameRate,
            },
            startupMs,
            ...result,
          },
        ]);
        setStatus(`Done: ${effect}.`);
      } catch (e) {
        logger.error("Background effects bench failed", e);
        setStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        track?.stop();
        setBusy(false);
      }
    },
    [seconds],
  );

  return (
    <div style={{ padding: 16, font: "14px system-ui", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 20 }}>Background effects: can this device?</h1>
      <p>
        The camera and the pipeline, with no call in the way. Run{" "}
        <strong>No effect</strong> first — every other number is only meaningful
        beside it, on this device, in this light.
      </p>
      <p>
        This device: <code>{platform}</code>, the app would{" "}
        <strong>{supportsBackgroundProcessors() ? "allow" : "refuse"}</strong>{" "}
        effects here, the browser has{" "}
        <strong>
          {supportsModernBackgroundProcessors()
            ? "the fast path"
            : "only the canvas fallback"}
        </strong>
        .
      </p>
      <label>
        Seconds per run:{" "}
        <select
          value={seconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
          disabled={busy}
        >
          <option value={30}>30</option>
          <option value={60}>60</option>
          <option value={300}>300 (five minutes, for throttling)</option>
          <option value={600}>600 (ten minutes)</option>
        </select>
      </label>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {(["none", "blur", "image"] as const).map((effect) => (
          <button
            key={effect}
            disabled={busy}
            onClick={() => void measure(effect)}
            style={{ padding: "8px 12px" }}
          >
            {effect === "none" ? "No effect" : effect}
          </button>
        ))}
      </div>
      <p>
        <strong>{status}</strong>
      </p>
      <video
        ref={video}
        muted
        playsInline
        style={{ inlineSize: "100%", maxInlineSize: 320, background: "#000" }}
      />
      {runs.map((run, i) => (
        <div key={i} style={{ marginBlockStart: 12 }}>
          <strong>{run.effect}</strong>: mean {run.meanFps.toFixed(1)}fps, worst{" "}
          {run.worstFps.toFixed(1)}fps
          {run.startupMs !== null && <> , started in {run.startupMs}ms</>}, main
          thread stalled up to {run.worstTimerLagMs}ms
        </div>
      ))}
      {runs.length > 0 && (
        <textarea
          readOnly
          value={JSON.stringify(runs, null, 2)}
          style={{ inlineSize: "100%", blockSize: 240, marginBlockStart: 12 }}
        />
      )}
    </div>
  );
};

/**
 * Counts frames as the video actually presents them, which is the rate the
 * pipeline is really delivering rather than the rate it was asked for.
 */
async function countFrames(
  element: HTMLVideoElement,
  seconds: number,
  onProgress: (done: number) => void,
): Promise<
  Pick<
    Run,
    | "meanFps"
    | "worstFps"
    | "buckets"
    | "worstTimerLagMs"
    | "frames"
    | "seconds"
  >
> {
  return new Promise((resolve) => {
    const buckets: Bucket[] = [];
    let frames = 0;
    let inBucket = 0;
    let started: number | null = null;
    let bucketStarted = 0;

    // A phone that is struggling stalls its main thread, and a timer is the
    // cheapest witness to that: Safari has no long-task observer.
    let worstTimerLagMs = 0;
    let lastTick = performance.now();
    const ticker = window.setInterval(() => {
      const now = performance.now();
      worstTimerLagMs = Math.max(
        worstTimerLagMs,
        Math.round(now - lastTick - 100),
      );
      lastTick = now;
    }, 100);

    const finish = (): void => {
      window.clearInterval(ticker);
      const elapsed =
        started === null ? 0 : (performance.now() - started) / 1000;
      resolve({
        meanFps: elapsed > 0 ? frames / elapsed : 0,
        worstFps: buckets.length
          ? Math.min(...buckets.map((b) => b.fps))
          : elapsed > 0
            ? frames / elapsed
            : 0,
        buckets,
        worstTimerLagMs,
        frames,
        seconds: Math.round(elapsed),
      });
    };

    const onFrame = (): void => {
      const now = performance.now();
      if (started === null) {
        started = now;
        bucketStarted = now;
      }
      frames += 1;
      inBucket += 1;
      if (now - bucketStarted >= bucketSeconds * 1000) {
        buckets.push({
          at: Math.round((now - started) / 1000),
          fps: inBucket / ((now - bucketStarted) / 1000),
        });
        onProgress(Math.round((now - started) / 1000));
        inBucket = 0;
        bucketStarted = now;
      }
      if (now - started >= seconds * 1000) return finish();
      element.requestVideoFrameCallback(onFrame);
    };

    if (!("requestVideoFrameCallback" in element)) {
      window.clearInterval(ticker);
      resolve({
        meanFps: 0,
        worstFps: 0,
        buckets: [],
        worstTimerLagMs: 0,
        frames: 0,
        seconds: 0,
      });
      return;
    }
    element.requestVideoFrameCallback(onFrame);
  });
}
