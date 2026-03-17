/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import createRNNWasmModuleSync from "@jitsi/rnnoise-wasm/dist/rnnoise-sync.js";

import type { RNNoiseSuppressionPreset } from "./rnnoiseTypes";

declare abstract class AudioWorkletProcessor {
  protected constructor(options?: AudioWorkletNodeOptions);
  public readonly port: MessagePort;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (
    options?: AudioWorkletNodeOptions,
  ) => AudioWorkletProcessor,
): void;

const FRAME_SIZE = 480;
const RING_SIZE = FRAME_SIZE * 3;
const SAMPLE_RATE = 48000;
const RNNOISE_WORKLET_NAME = "rnnoise-processor";
const DEFAULT_PRESET: RNNoiseSuppressionPreset = "conservative";

type PresetConfig = {
  maxAttenuationDb: number;
  openThreshold: number;
  closeThreshold: number;
  holdFrames: number;
  attenuateMs: number;
  releaseMs: number;
};

type RNNoiseModule = {
  HEAPF32: Float32Array;
  [key: string]: unknown;
};

type WorkletMessage =
  | { type: "destroy" }
  | { type: "preset"; preset: RNNoiseSuppressionPreset };

const PRESETS: Record<RNNoiseSuppressionPreset, PresetConfig> = {
  conservative: {
    maxAttenuationDb: 4,
    openThreshold: 0.92,
    closeThreshold: 0.6,
    holdFrames: 12,
    attenuateMs: 120,
    releaseMs: 25,
  },
  balanced: {
    maxAttenuationDb: 8,
    openThreshold: 0.9,
    closeThreshold: 0.55,
    holdFrames: 10,
    attenuateMs: 90,
    releaseMs: 22,
  },
  strong: {
    maxAttenuationDb: 16,
    openThreshold: 0.9,
    closeThreshold: 0.55,
    holdFrames: 8,
    attenuateMs: 55,
    releaseMs: 18,
  },
};

function isPreset(
  preset: unknown,
): preset is keyof typeof PRESETS & RNNoiseSuppressionPreset {
  return typeof preset === "string" && preset in PRESETS;
}

class RNNoiseWorkletProcessor extends AudioWorkletProcessor {
  private ready = false;
  private destroyed = false;
  private readonly inBuf = new Float32Array(RING_SIZE);
  private readonly outBuf = new Float32Array(RING_SIZE);
  private inW = 0;
  private inR = 0;
  private outW = 0;
  private outR = 0;
  private currentGain = 1;
  private targetGain = 1;
  private holdFrames = 0;
  private maxAttenuationDb = PRESETS[DEFAULT_PRESET].maxAttenuationDb;
  private openThreshold = PRESETS[DEFAULT_PRESET].openThreshold;
  private closeThreshold = PRESETS[DEFAULT_PRESET].closeThreshold;
  private holdFramesConfig = PRESETS[DEFAULT_PRESET].holdFrames;
  private attenuateStep = 1;
  private releaseStep = 1;
  private module?: RNNoiseModule;
  private pcmBuf?: number;
  private state: number | null = null;
  private heapF32?: Float32Array;

  public constructor() {
    super();

    this.setPreset(DEFAULT_PRESET);
    this.initRNNoise();

    this.port.onmessage = (event: MessageEvent<WorkletMessage>): void => {
      if (event.data.type === "destroy") {
        this.cleanup();
      } else if (event.data.type === "preset" && isPreset(event.data.preset)) {
        this.setPreset(event.data.preset);
      }
    };
  }

  private smoothingStepFromMs(ms: number): number {
    if (ms <= 0) return 1;
    const tau = ms / 1000;
    return 1 - Math.exp(-1 / (SAMPLE_RATE * tau));
  }

  private setPreset(preset: RNNoiseSuppressionPreset): void {
    if (!isPreset(preset)) return;

    const config = PRESETS[preset];
    this.maxAttenuationDb = config.maxAttenuationDb;
    this.openThreshold = config.openThreshold;
    this.closeThreshold = config.closeThreshold;
    this.holdFramesConfig = config.holdFrames;
    this.attenuateStep = this.smoothingStepFromMs(config.attenuateMs);
    this.releaseStep = this.smoothingStepFromMs(config.releaseMs);
  }

  private updateTargetGain(vadProbability: number): void {
    if (vadProbability >= this.openThreshold) {
      this.holdFrames = this.holdFramesConfig;
      this.targetGain = 1;
      return;
    }

    if (this.holdFrames > 0) {
      this.holdFrames -= 1;
      this.targetGain = 1;
      return;
    }

    const thresholdRange = this.openThreshold - this.closeThreshold;
    const attenuationProgress =
      thresholdRange > 0
        ? Math.max(
            0,
            Math.min(1, (this.openThreshold - vadProbability) / thresholdRange),
          )
        : 1;

    const attenuationDb = attenuationProgress * this.maxAttenuationDb;
    this.targetGain = Math.pow(10, -attenuationDb / 20);
  }

  private ringAvailable(w: number, r: number): number {
    let available = w - r;
    if (available < 0) available += RING_SIZE;
    return available;
  }

  private initRNNoise(): void {
    try {
      const module = createRNNWasmModuleSync() as unknown as RNNoiseModule;
      const malloc = module["_malloc"] as (size: number) => number;
      const rnnoiseInit = module["_rnnoise_init"] as () => void;
      const rnnoiseCreate = module["_rnnoise_create"] as () => number;
      const pcmBuf = malloc(FRAME_SIZE * 4);
      rnnoiseInit();
      const state = rnnoiseCreate();

      this.module = module;
      this.pcmBuf = pcmBuf;
      this.state = state;
      this.heapF32 = module.HEAPF32;
      this.ready = true;
    } catch (error) {
      this.port.postMessage({ type: "error", message: String(error) });
    }
  }

  private cleanup(): void {
    if (this.module && this.state !== null && this.pcmBuf !== undefined) {
      const rnnoiseDestroy = this.module["_rnnoise_destroy"] as (
        state: number,
      ) => void;
      const free = this.module["_free"] as (ptr: number) => void;
      rnnoiseDestroy(this.state);
      free(this.pcmBuf);
      this.state = null;
    }
    this.destroyed = true;
  }

  private processRNNoiseFrame(): void {
    if (
      !this.module ||
      this.state === null ||
      this.pcmBuf === undefined ||
      !this.heapF32
    ) {
      return;
    }

    const heapIdx = this.pcmBuf >> 2;

    for (let i = 0; i < FRAME_SIZE; i++) {
      this.heapF32[heapIdx + i] =
        this.inBuf[(this.inR + i) % RING_SIZE] * 32768;
    }
    this.inR = (this.inR + FRAME_SIZE) % RING_SIZE;

    const rnnoiseProcessFrame = this.module["_rnnoise_process_frame"] as (
      state: number,
      input: number,
      output: number,
    ) => number;
    const vadProbability = rnnoiseProcessFrame(
      this.state,
      this.pcmBuf,
      this.pcmBuf,
    );
    this.updateTargetGain(vadProbability);

    for (let i = 0; i < FRAME_SIZE; i++) {
      const smoothingStep =
        this.targetGain < this.currentGain
          ? this.attenuateStep
          : this.releaseStep;
      this.currentGain += (this.targetGain - this.currentGain) * smoothingStep;
      this.outBuf[(this.outW + i) % RING_SIZE] =
        (this.heapF32[heapIdx + i] / 32768) * this.currentGain;
    }
    this.outW = (this.outW + FRAME_SIZE) % RING_SIZE;
  }

  private mixInputChannels(
    inputChannels: Float32Array[],
    sampleIndex: number,
    channelCount: number,
  ): number {
    let mixed = 0;
    for (let i = 0; i < channelCount; i++) {
      const channel = inputChannels[i];
      mixed += channel ? (channel[sampleIndex] ?? 0) : 0;
    }
    return mixed / channelCount;
  }

  public process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.destroyed) return false;

    const inputChannels = inputs[0];
    const output = outputs[0]?.[0];

    if (!inputChannels?.length || !output) return true;

    const blockSize = output.length;
    const channelCount = inputChannels.length;

    if (!this.ready) {
      for (let i = 0; i < blockSize; i++) {
        output[i] = this.mixInputChannels(inputChannels, i, channelCount);
      }
      return true;
    }

    for (let i = 0; i < blockSize; i++) {
      this.inBuf[this.inW] = this.mixInputChannels(
        inputChannels,
        i,
        channelCount,
      );
      this.inW = (this.inW + 1) % RING_SIZE;
    }

    while (this.ringAvailable(this.inW, this.inR) >= FRAME_SIZE) {
      this.processRNNoiseFrame();
    }

    const outAvailable = this.ringAvailable(this.outW, this.outR);
    const toRead = Math.min(blockSize, outAvailable);

    for (let i = 0; i < toRead; i++) {
      output[i] = this.outBuf[this.outR];
      this.outR = (this.outR + 1) % RING_SIZE;
    }
    for (let i = toRead; i < blockSize; i++) {
      output[i] = 0;
    }

    return true;
  }
}

registerProcessor(RNNOISE_WORKLET_NAME, RNNoiseWorkletProcessor);
