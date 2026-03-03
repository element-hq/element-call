/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";

import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client";
import type { RNNoiseSuppressionPreset } from "./rnnoiseTypes";

/**
 * The number of samples per frame expected by RNNoise (at 48kHz = 10ms).
 */
const RNNOISE_SAMPLE_LENGTH = 480;
const RNNOISE_REQUIRED_SAMPLE_RATE = 48000;
const RNNOISE_WORKLET_NAME = "rnnoise-processor";
const DEFAULT_RNNOISE_PRESET: RNNoiseSuppressionPreset = "conservative";
const loadedAudioWorklets = new WeakSet<AudioContext>();
const warnedUnsupportedSampleRates = new Set<number>();

function createUnsupportedSampleRateError(sampleRate: number): Error {
  return new Error(
    `RNNoise requires an AudioContext sample rate of ${RNNOISE_REQUIRED_SAMPLE_RATE}Hz (received ${sampleRate}Hz).`,
  );
}

function warnUnsupportedSampleRate(sampleRate: number): void {
  if (warnedUnsupportedSampleRates.has(sampleRate)) {
    return;
  }

  warnedUnsupportedSampleRates.add(sampleRate);
  logger.warn(
    `Skipping RNNoise because AudioContext sample rate is ${sampleRate}Hz (expected ${RNNOISE_REQUIRED_SAMPLE_RATE}Hz).`,
  );
}

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
const SAMPLE_RATE = ${RNNOISE_REQUIRED_SAMPLE_RATE};
const DEFAULT_PRESET = "${DEFAULT_RNNOISE_PRESET}";
const PRESETS = {
  conservative: {
    maxAttenuationDb: 4,
    openThreshold: 0.92,
    closeThreshold: 0.60,
    holdFrames: 12,
    attenuateMs: 120,
    releaseMs: 25,
  },
  balanced: {
    maxAttenuationDb: 8,
    openThreshold: 0.90,
    closeThreshold: 0.55,
    holdFrames: 10,
    attenuateMs: 90,
    releaseMs: 22,
  },
  strong: {
    maxAttenuationDb: 16,
    openThreshold: 0.90,
    closeThreshold: 0.55,
    holdFrames: 8,
    attenuateMs: 55,
    releaseMs: 18,
  },
};

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
    this._currentGain = 1;
    this._targetGain = 1;
    this._holdFrames = 0;

    this._setPreset(DEFAULT_PRESET);

    this._initRNNoise();

    this.port.onmessage = (event) => {
      if (event.data.type === 'destroy') {
        this._cleanup();
      } else if (event.data.type === 'preset') {
        this._setPreset(event.data.preset);
      }
    };
  }

  _smoothingStepFromMs(ms) {
    if (ms <= 0) return 1;
    const tau = ms / 1000;
    return 1 - Math.exp(-1 / (SAMPLE_RATE * tau));
  }

  _setPreset(preset) {
    if (!(preset in PRESETS)) return;
    this._preset = preset;
    const config = PRESETS[preset];
    this._maxAttenuationDb = config.maxAttenuationDb;
    this._openThreshold = config.openThreshold;
    this._closeThreshold = config.closeThreshold;
    this._holdFramesConfig = config.holdFrames;
    this._attenuateStep = this._smoothingStepFromMs(config.attenuateMs);
    this._releaseStep = this._smoothingStepFromMs(config.releaseMs);
  }

  _updateTargetGain(vadProbability) {
    if (vadProbability >= this._openThreshold) {
      this._holdFrames = this._holdFramesConfig;
      this._targetGain = 1;
      return;
    }

    if (this._holdFrames > 0) {
      this._holdFrames -= 1;
      this._targetGain = 1;
      return;
    }

    const thresholdRange = this._openThreshold - this._closeThreshold;
    const attenuationProgress = thresholdRange > 0
      ? Math.max(
          0,
          Math.min(1, (this._openThreshold - vadProbability) / thresholdRange),
        )
      : 1;

    const attenuationDb = attenuationProgress * this._maxAttenuationDb;
    this._targetGain = Math.pow(10, -attenuationDb / 20);
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
    const vadProbability = this._module._rnnoise_process_frame(
      this._state, this._pcmBuf, this._pcmBuf
    );
    this._updateTargetGain(vadProbability);

    // Copy from WASM heap to output ring buffer, scaling back to float range.
    // Apply additional conservative attenuation between speech segments.
    for (let i = 0; i < FRAME_SIZE; i++) {
      const smoothingStep = this._targetGain < this._currentGain
        ? this._attenuateStep
        : this._releaseStep;
      this._currentGain +=
        (this._targetGain - this._currentGain) * smoothingStep;
      this._outBuf[(this._outW + i) % RING_SIZE] =
        (this._heapF32[heapIdx + i] / 32768.0) * this._currentGain;
    }
    this._outW = (this._outW + FRAME_SIZE) % RING_SIZE;
  }

  _mixInputChannels(inputChannels, sampleIndex, channelCount) {
    // RNNoise is mono-only; average all channels for deterministic downmixing.
    let mixed = 0;
    for (let i = 0; i < channelCount; i++) {
      const channel = inputChannels[i];
      mixed += channel ? (channel[sampleIndex] ?? 0) : 0;
    }
    return mixed / channelCount;
  }

  process(inputs, outputs) {
    if (this._destroyed) return false;

    const inputChannels = inputs[0];
    const output = outputs[0]?.[0];

    if (!inputChannels?.length || !output) return true;

    const blockSize = output.length;
    const channelCount = inputChannels.length;

    if (!this._ready) {
      // Pass through until RNNoise is ready, with deterministic mono downmix.
      for (let i = 0; i < blockSize; i++) {
        output[i] = this._mixInputChannels(inputChannels, i, channelCount);
      }
      return true;
    }

    // Write input samples to the input ring buffer
    for (let i = 0; i < blockSize; i++) {
      this._inBuf[this._inW] = this._mixInputChannels(
        inputChannels,
        i,
        channelCount,
      );
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

export function createRNNoiseWorkletCodeForTesting(
  rnnoiseModuleCode: string,
): string {
  return createWorkletCode(rnnoiseModuleCode);
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
  private preset: RNNoiseSuppressionPreset;
  private lastAudioContext?: AudioContext;

  public constructor(
    preset: RNNoiseSuppressionPreset = DEFAULT_RNNOISE_PRESET,
  ) {
    this.preset = preset;
  }

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
    const blobUrl = URL.createObjectURL(blob);

    try {
      await audioContext.audioWorklet.addModule(blobUrl);
      loadedAudioWorklets.add(audioContext);
      this.blobUrl = blobUrl;
    } catch (e) {
      URL.revokeObjectURL(blobUrl);
      throw e;
    }
  }

  public async init(opts: AudioProcessorOptions): Promise<void> {
    this.destroyed = false;
    const { audioContext, track } = opts;

    if (audioContext.sampleRate !== RNNOISE_REQUIRED_SAMPLE_RATE) {
      warnUnsupportedSampleRate(audioContext.sampleRate);
      throw createUnsupportedSampleRateError(audioContext.sampleRate);
    }

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
    this.workletNode.port.postMessage({ type: "preset", preset: this.preset });
    this.processedTrack = destinationNode.stream.getAudioTracks()[0];
    this.lastAudioContext = audioContext;
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    const audioContext = opts.audioContext ?? this.lastAudioContext;
    if (!audioContext) {
      throw new Error(
        "RNNoise restart requires an AudioContext when no previous context has been initialized.",
      );
    }

    await this.destroy();
    await this.init({ ...opts, audioContext });
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

    try {
      this.processedTrack?.stop();
    } catch (e) {
      logger.warn("Failed to stop RNNoise processed track during destroy", e);
    }

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

  public setPreset(preset: RNNoiseSuppressionPreset): void {
    this.preset = preset;
    this.workletNode?.port.postMessage({
      type: "preset",
      preset: this.preset,
    });
  }
}
