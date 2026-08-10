/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Track } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
// ?worker&url tells Vite to compile the TypeScript worklet and return its URL.
// Without this, Vite copies the .ts file verbatim and the browser rejects it.
import compiledWorkletUrl from "./TenVadProcessor.worklet.ts?worker&url";

const log = logger.getChild("[TenVadTransformer]");

export interface TenVadParams {
  // TEN-VAD params — processed entirely inside the AudioWorklet
  vadEnabled: boolean;
  vadPositiveThreshold: number; // open gate when prob >= this (0–1)
  vadNegativeThreshold: number; // close gate when prob < this (0–1); computed by Publisher
  vadMode: "standard" | "aggressive" | "loose";
  holdMs: number;               // hold time before closing gate (ms); 0 = no hold
}

/**
 * Matches LiveKit's AudioProcessorOptions (experimental API, not publicly
 * exported, so we declare it locally based on the type definitions).
 */
interface AudioProcessorOptions {
  kind: Track.Kind.Audio;
  track: MediaStreamTrack;
  audioContext: AudioContext;
  element?: HTMLMediaElement;
}

/**
 * Matches LiveKit's TrackProcessor<Track.Kind.Audio> interface.
 */
export interface AudioTrackProcessor {
  name: string;
  processedTrack?: MediaStreamTrack;
  init(opts: AudioProcessorOptions): Promise<void>;
  restart(opts: AudioProcessorOptions): Promise<void>;
  destroy(): Promise<void>;
}

// Cached compiled TEN-VAD module — compiled once, reused across processor restarts.
let tenVadModulePromise: Promise<WebAssembly.Module> | null = null;

function getTenVADModule(): Promise<WebAssembly.Module> {
  if (!tenVadModulePromise) {
    tenVadModulePromise = fetch("/vad/ten_vad.wasm")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch ten_vad.wasm: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => WebAssembly.compile(buf))
      .catch((e) => {
        // Clear the cache so a retry is possible on next attach
        tenVadModulePromise = null;
        throw e;
      });
  }
  return tenVadModulePromise;
}

/**
 * LiveKit audio track processor that applies TEN-VAD via AudioWorklet.
 *
 * The TEN-VAD WASM module is fetched once, compiled, and passed to the worklet
 * via processorOptions so it runs synchronously inside the audio thread —
 * no IPC round-trip, ~16 ms VAD latency.
 *
 * Audio graph: sourceNode → workletNode → destinationNode
 * processedTrack is destinationNode.stream.getAudioTracks()[0]
 */
export class TenVadTransformer implements AudioTrackProcessor {
  public readonly name = "ten-vad";
  public processedTrack?: MediaStreamTrack;

  private workletNode?: AudioWorkletNode;
  private sourceNode?: MediaStreamAudioSourceNode;
  private destinationNode?: MediaStreamAudioDestinationNode;
  private params: TenVadParams;

  public constructor(params: TenVadParams) {
    this.params = { ...params };
  }

  public async init(opts: AudioProcessorOptions): Promise<void> {
    const { track, audioContext } = opts;

    log.info("init() called, audioContext state:", audioContext.state, "params:", this.params);

    // Fetch and compile the TEN-VAD WASM module (cached after first call)
    let tenVadModule: WebAssembly.Module | undefined;
    try {
      tenVadModule = await getTenVADModule();
      log.info("TEN-VAD WASM module compiled");
    } catch (e) {
      log.warn("TEN-VAD WASM module unavailable — VAD disabled:", e);
    }

    log.info("loading worklet from:", compiledWorkletUrl);
    await audioContext.audioWorklet.addModule(compiledWorkletUrl);
    log.info("worklet module loaded");

    this.workletNode = new AudioWorkletNode(
      audioContext,
      "ten-vad-processor",
      {
        processorOptions: {
          tenVadModule,
        },
      },
    );
    this.workletNode.port.onmessage = (
      e: MessageEvent<{ type: string; msg: string }>,
    ): void => {
      if (e.data?.type === "log") log.debug(e.data.msg);
    };
    this.sendParams();

    this.sourceNode = audioContext.createMediaStreamSource(
      new MediaStream([track]),
    );
    this.destinationNode = audioContext.createMediaStreamDestination();

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
    log.info("graph wired, processedTrack:", this.processedTrack);
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async destroy(): Promise<void> {
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.destinationNode?.disconnect();
    this.sourceNode = undefined;
    this.workletNode = undefined;
    this.destinationNode = undefined;
    this.processedTrack = undefined;
  }

  /** Push updated gate/VAD parameters to the running worklet. */
  public updateParams(params: TenVadParams): void {
    this.params = { ...params };
    this.sendParams();
  }

  private sendParams(): void {
    if (!this.workletNode) return;
    log.debug("sendParams:", this.params);
    this.workletNode.port.postMessage(this.params);
  }
}
