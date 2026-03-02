/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client";

/**
 * The number of samples per frame expected by RNNoise (at 48kHz = 10ms).
 */
const RNNOISE_SAMPLE_LENGTH = 480;
const RNNOISE_WORKLET_NAME = "rnnoise-processor";
const loadedAudioWorklets = new WeakSet<AudioContext>();

/**
 * Whether the current runtime supports the required APIs for RNNoise.
 */
export function supportsRNNoiseProcessor(): boolean {
  return (
    typeof AudioWorkletNode !== "undefined" &&
    typeof MediaStreamAudioDestinationNode !== "undefined" &&
    typeof MediaStreamAudioSourceNode !== "undefined"
  );
}

/**
 * Generates the AudioWorklet processor code as a string.
 *
 * The worklet loads the RNNoise WASM module synchronously (base64-inlined)
 * and processes audio in 480-sample frames. A ring buffer bridges the
 * 128-sample AudioWorklet blocks to the 480-sample RNNoise frames.
 */
function createWorkletCode(rnnoiseModuleCode: string): string {
  // Patch the rnnoise-sync.js for AudioWorklet scope:
  // 1. Replace import.meta.url — not available in classic worklet scripts
  // 2. Remove the ES module export statement
  const patched = rnnoiseModuleCode
    .replace(/import\.meta\.url/g, '""')
    .replace(/export\s+default\s+createRNNWasmModuleSync;?\s*$/m, "");

  return `
${patched}

const FRAME_SIZE = ${RNNOISE_SAMPLE_LENGTH};
const RING_SIZE = FRAME_SIZE * 3; // Enough headroom for buffering

class RNNoiseWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ready = false;
    this._destroyed = false;

    // Ring buffers
    this._inBuf = new Float32Array(RING_SIZE);
    this._outBuf = new Float32Array(RING_SIZE);
    this._inW = 0;  // input write position
    this._inR = 0;  // input read position
    this._outW = 0; // output write position
    this._outR = 0; // output read position

    this._initRNNoise();

    this.port.onmessage = (event) => {
      if (event.data.type === 'destroy') {
        this._cleanup();
      }
    };
  }

  _ringAvailable(w, r) {
    let avail = w - r;
    if (avail < 0) avail += RING_SIZE;
    return avail;
  }

  _initRNNoise() {
    try {
      const module = createRNNWasmModuleSync();

      // Allocate a buffer in WASM memory for one frame of float32 samples
      const pcmBuf = module._malloc(FRAME_SIZE * 4);
      module._rnnoise_init();
      const state = module._rnnoise_create();

      this._module = module;
      this._pcmBuf = pcmBuf;
      this._state = state;
      this._heapF32 = module.HEAPF32;

      this._ready = true;
    } catch (e) {
      // If RNNoise fails to initialize, audio will pass through unprocessed
      this.port.postMessage({ type: 'error', message: String(e) });
    }
  }

  _cleanup() {
    if (this._module && this._state) {
      this._module._rnnoise_destroy(this._state);
      this._module._free(this._pcmBuf);
      this._state = null;
    }
    this._destroyed = true;
  }

  _processRNNoiseFrame() {
    const heapIdx = this._pcmBuf >> 2; // byte offset → float32 index

    // Copy from input ring buffer to WASM heap, scaling to int16 range
    for (let i = 0; i < FRAME_SIZE; i++) {
      this._heapF32[heapIdx + i] =
        this._inBuf[(this._inR + i) % RING_SIZE] * 32768.0;
    }
    this._inR = (this._inR + FRAME_SIZE) % RING_SIZE;

    // Run RNNoise denoising (in-place)
    this._module._rnnoise_process_frame(
      this._state, this._pcmBuf, this._pcmBuf
    );

    // Copy from WASM heap to output ring buffer, scaling back to float range
    for (let i = 0; i < FRAME_SIZE; i++) {
      this._outBuf[(this._outW + i) % RING_SIZE] =
        this._heapF32[heapIdx + i] / 32768.0;
    }
    this._outW = (this._outW + FRAME_SIZE) % RING_SIZE;
  }

  process(inputs, outputs) {
    if (this._destroyed) return false;

    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (!input || !output) return true;

    if (!this._ready) {
      // Pass through until RNNoise is ready
      output.set(input);
      return true;
    }

    const blockSize = input.length;

    // Write input samples to the input ring buffer
    for (let i = 0; i < blockSize; i++) {
      this._inBuf[this._inW] = input[i];
      this._inW = (this._inW + 1) % RING_SIZE;
    }

    // Process complete frames
    while (this._ringAvailable(this._inW, this._inR) >= FRAME_SIZE) {
      this._processRNNoiseFrame();
    }

    // Read from output ring buffer
    const outAvail = this._ringAvailable(this._outW, this._outR);
    const toRead = Math.min(blockSize, outAvail);

    for (let i = 0; i < toRead; i++) {
      output[i] = this._outBuf[this._outR];
      this._outR = (this._outR + 1) % RING_SIZE;
    }
    // Fill remaining with silence (only during initial buffering)
    for (let i = toRead; i < blockSize; i++) {
      output[i] = 0;
    }

    return true;
  }
}

registerProcessor('${RNNOISE_WORKLET_NAME}', RNNoiseWorkletProcessor);
`;
}

/**
 * A LiveKit TrackProcessor that applies RNNoise-based noise suppression
 * to a local audio track via an AudioWorklet.
 *
 * The RNNoise WASM binary is lazy-loaded only when the processor is
 * initialized, keeping the main bundle small.
 */
export class RNNoiseProcessor implements TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> {
  public name = "rnnoise-noise-suppression";
  public processedTrack?: MediaStreamTrack;

  private sourceNode?: MediaStreamAudioSourceNode;
  private workletNode?: AudioWorkletNode;
  private destinationNode?: MediaStreamAudioDestinationNode;
  private blobUrl?: string;
  private destroyed = false;

  private async ensureWorkletRegistered(
    audioContext: AudioContext,
  ): Promise<void> {
    if (loadedAudioWorklets.has(audioContext)) {
      return;
    }

    // Lazy-load the RNNoise sync WASM module code
    const rnnoiseModule =
      await import("@jitsi/rnnoise-wasm/dist/rnnoise-sync.js?raw");
    const workletCode = createWorkletCode(
      rnnoiseModule.default as unknown as string,
    );

    // Create a Blob URL for the AudioWorklet module.
    const blob = new Blob([workletCode], { type: "text/javascript" });
    this.blobUrl = URL.createObjectURL(blob);

    await audioContext.audioWorklet.addModule(this.blobUrl);
    loadedAudioWorklets.add(audioContext);
  }

  public async init(opts: AudioProcessorOptions): Promise<void> {
    this.destroyed = false;
    const { audioContext, track } = opts;

    await this.ensureWorkletRegistered(audioContext);

    // Build the audio processing graph:
    // MediaStreamSource → AudioWorkletNode (RNNoise) → MediaStreamDestination
    const sourceNode = audioContext.createMediaStreamSource(
      new MediaStream([track]),
    );
    const workletNode = new AudioWorkletNode(
      audioContext,
      RNNOISE_WORKLET_NAME,
      {
        channelCount: 1,
        channelCountMode: "explicit",
      },
    );
    const destinationNode = audioContext.createMediaStreamDestination();

    sourceNode.connect(workletNode);
    workletNode.connect(destinationNode);

    this.sourceNode = sourceNode;
    this.workletNode = workletNode;
    this.destinationNode = destinationNode;
    this.processedTrack = destinationNode.stream.getAudioTracks()[0];
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  public async destroy(): Promise<void> {
    if (this.destroyed) {
      await Promise.resolve();
      return;
    }
    this.destroyed = true;

    // Signal the worklet to clean up WASM resources
    this.workletNode?.port.postMessage({ type: "destroy" });

    // Disconnect the audio graph
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.destinationNode?.disconnect();

    // Revoke the Blob URL
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = undefined;
    }

    this.sourceNode = undefined;
    this.workletNode = undefined;
    this.destinationNode = undefined;
    this.processedTrack = undefined;
    await Promise.resolve();
  }
}
