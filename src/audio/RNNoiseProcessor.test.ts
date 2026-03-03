/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Track } from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  createRNNoiseWorkletCodeForTesting,
  RNNoiseProcessor,
  supportsRNNoiseProcessor,
} from "./RNNoiseProcessor";

vi.mock("@jitsi/rnnoise-wasm/dist/rnnoise-sync.js?raw", () => ({
  default:
    "function createRNNWasmModuleSync(){}; export default createRNNWasmModuleSync;",
}));

type TestContext = {
  addModule: ReturnType<typeof vi.fn>;
  createSourceNode: ReturnType<typeof vi.fn>;
  createDestinationNode: ReturnType<typeof vi.fn>;
  sourceNode: MediaStreamAudioSourceNode;
  destinationNode: MediaStreamAudioDestinationNode;
  processedTrack: MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
  workletNode: AudioWorkletNode;
  audioContext: AudioContext;
  track: MediaStreamTrack;
};

function createTestContext(sampleRate = 48000): TestContext {
  const processedTrack = {
    id: "processed-track",
    stop: vi.fn(),
  } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
  const sourceNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as MediaStreamAudioSourceNode;
  const destinationNode = {
    stream: {
      getAudioTracks: () => [processedTrack],
    },
    disconnect: vi.fn(),
  } as unknown as MediaStreamAudioDestinationNode;
  const workletNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    port: {
      postMessage: vi.fn(),
    },
  } as unknown as AudioWorkletNode;
  const addModule = vi.fn().mockResolvedValue(undefined);
  const createSourceNode = vi.fn().mockReturnValue(sourceNode);
  const createDestinationNode = vi.fn().mockReturnValue(destinationNode);
  const audioContext = {
    sampleRate,
    audioWorklet: { addModule },
    createMediaStreamSource: createSourceNode,
    createMediaStreamDestination: createDestinationNode,
  } as unknown as AudioContext;
  const track = {
    id: "input-track",
    kind: Track.Kind.Audio,
  } as MediaStreamTrack;

  return {
    addModule,
    createSourceNode,
    createDestinationNode,
    sourceNode,
    destinationNode,
    processedTrack,
    workletNode,
    audioContext,
    track,
  };
}

function getGeneratedWorkletCode(): string {
  return createRNNoiseWorkletCodeForTesting(
    "function createRNNWasmModuleSync(){}; export default createRNNWasmModuleSync;",
  );
}

type WorkletPresetConfig = {
  maxAttenuationDb: number;
  openThreshold: number;
  closeThreshold: number;
  holdFrames: number;
  attenuateMs: number;
  releaseMs: number;
};

function getPresetConfig(
  workletCode: string,
  preset: "conservative" | "balanced" | "strong",
): WorkletPresetConfig {
  const presetMatch = workletCode.match(
    new RegExp(`${preset}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`),
  );
  if (!presetMatch) {
    throw new Error(`Could not find ${preset} preset in worklet code.`);
  }
  const presetBlock = presetMatch[1];
  const readNumber = (key: keyof WorkletPresetConfig): number => {
    const keyMatch = presetBlock.match(new RegExp(`${key}:\\s*([0-9.]+)`));
    if (!keyMatch) {
      throw new Error(`Could not find ${key} in ${preset} preset.`);
    }
    return Number(keyMatch[1]);
  };

  return {
    maxAttenuationDb: readNumber("maxAttenuationDb"),
    openThreshold: readNumber("openThreshold"),
    closeThreshold: readNumber("closeThreshold"),
    holdFrames: readNumber("holdFrames"),
    attenuateMs: readNumber("attenuateMs"),
    releaseMs: readNumber("releaseMs"),
  };
}

function expectedAttenuationDb(
  config: WorkletPresetConfig,
  vadProbability: number,
): number {
  if (vadProbability >= config.openThreshold) {
    return 0;
  }

  const thresholdRange = config.openThreshold - config.closeThreshold;
  const attenuationProgress =
    thresholdRange > 0
      ? Math.max(
          0,
          Math.min(
            1,
            (config.openThreshold - vadProbability) / thresholdRange,
          ),
        )
      : 1;
  return attenuationProgress * config.maxAttenuationDb;
}

function instantiateWorkletProcessor(workletCode: string): {
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    params?: Record<string, unknown>,
  ) => boolean;
} {
  let ProcessorCtor:
    | (new () => {
        process: (
          inputs: Float32Array[][],
          outputs: Float32Array[][],
          params?: Record<string, unknown>,
        ) => boolean;
      })
    | undefined;

  class TestAudioWorkletProcessor {
    public readonly port = {
      postMessage: vi.fn(),
      onmessage: null as ((event: MessageEvent) => void) | null,
    };
  }

  const registerProcessor = vi.fn(
    (
      _name: string,
      ctor: new () => {
        process: (
          inputs: Float32Array[][],
          outputs: Float32Array[][],
          params?: Record<string, unknown>,
        ) => boolean;
      },
    ) => {
      ProcessorCtor = ctor;
    },
  );

  const runWorkletModule = new Function(
    "AudioWorkletProcessor",
    "registerProcessor",
    workletCode,
  );
  runWorkletModule(TestAudioWorkletProcessor, registerProcessor);

  if (!ProcessorCtor) {
    throw new Error("Expected worklet processor to be registered.");
  }

  return new ProcessorCtor();
}

describe("RNNoiseProcessor", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn().mockReturnValue("blob:rnnoise"),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.stubGlobal(
      "MediaStream",
      class MediaStream {
        public constructor(_tracks?: MediaStreamTrack[]) {}
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("initializes audio graph and exposes processed track", async () => {
    const t = createTestContext();
    vi.stubGlobal("AudioWorkletNode", vi.fn().mockReturnValue(t.workletNode));
    const processor = new RNNoiseProcessor("balanced");

    await processor.init({
      kind: Track.Kind.Audio,
      track: t.track,
      audioContext: t.audioContext,
    });

    expect(t.addModule).toHaveBeenCalledWith("blob:rnnoise");
    expect(t.createSourceNode).toHaveBeenCalledOnce();
    expect(t.createDestinationNode).toHaveBeenCalledOnce();
    expect(t.workletNode.port.postMessage).toHaveBeenCalledWith({
      type: "preset",
      preset: "balanced",
    });
    expect(processor.processedTrack).toBe(t.processedTrack);
  });

  it("destroys processing graph and is idempotent", async () => {
    const t = createTestContext();
    vi.stubGlobal("AudioWorkletNode", vi.fn().mockReturnValue(t.workletNode));
    const processor = new RNNoiseProcessor();

    await processor.init({
      kind: Track.Kind.Audio,
      track: t.track,
      audioContext: t.audioContext,
    });
    await processor.destroy();
    await processor.destroy();

    expect(t.sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(t.workletNode.disconnect).toHaveBeenCalledOnce();
    expect(t.destinationNode.disconnect).toHaveBeenCalledOnce();
    expect(t.workletNode.port.postMessage).toHaveBeenCalledWith({
      type: "destroy",
    });
    expect(t.processedTrack.stop).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:rnnoise");
    expect(processor.processedTrack).toBeUndefined();
  });

  it("destroy does not throw when no processed track exists", async () => {
    const processor = new RNNoiseProcessor();

    await expect(processor.destroy()).resolves.toBeUndefined();
  });

  it("restart re-initializes with a new processed track", async () => {
    const first = createTestContext();
    const second = createTestContext();
    const workletCtor = vi
      .fn()
      .mockReturnValueOnce(first.workletNode)
      .mockReturnValueOnce(second.workletNode);
    vi.stubGlobal("AudioWorkletNode", workletCtor);

    const processor = new RNNoiseProcessor();
    await processor.init({
      kind: Track.Kind.Audio,
      track: first.track,
      audioContext: first.audioContext,
    });
    const firstProcessedTrack = processor.processedTrack;

    await processor.restart({
      kind: Track.Kind.Audio,
      track: second.track,
      audioContext: second.audioContext,
    });

    expect(processor.processedTrack).toBe(second.processedTrack);
    expect(processor.processedTrack).not.toBe(firstProcessedTrack);
  });

  it("loads the worklet module once per AudioContext", async () => {
    const t = createTestContext();
    vi.stubGlobal("AudioWorkletNode", vi.fn().mockReturnValue(t.workletNode));
    const firstProcessor = new RNNoiseProcessor();
    const secondProcessor = new RNNoiseProcessor();

    await firstProcessor.init({
      kind: Track.Kind.Audio,
      track: t.track,
      audioContext: t.audioContext,
    });
    await secondProcessor.init({
      kind: Track.Kind.Audio,
      track: t.track,
      audioContext: t.audioContext,
    });

    expect(t.addModule).toHaveBeenCalledOnce();
  });

  it("reports support based on AudioWorklet availability", () => {
    expect(supportsRNNoiseProcessor()).toBe(false);
    vi.stubGlobal("AudioWorkletNode", class AudioWorkletNode {});
    vi.stubGlobal(
      "MediaStreamAudioDestinationNode",
      class MediaStreamAudioDestinationNode {},
    );
    vi.stubGlobal(
      "MediaStreamAudioSourceNode",
      class MediaStreamAudioSourceNode {},
    );
    vi.stubGlobal(
      "AudioWorklet",
      class AudioWorkletWithoutAddModule {},
    );
    expect(supportsRNNoiseProcessor()).toBe(false);
    vi.stubGlobal(
      "AudioWorklet",
      class AudioWorklet {
        public async addModule(): Promise<void> {
          await Promise.resolve();
        }
      },
    );
    expect(supportsRNNoiseProcessor()).toBe(true);
  });

  it("updates worklet preset at runtime", async () => {
    const t = createTestContext();
    vi.stubGlobal("AudioWorkletNode", vi.fn().mockReturnValue(t.workletNode));
    const processor = new RNNoiseProcessor();

    await processor.init({
      kind: Track.Kind.Audio,
      track: t.track,
      audioContext: t.audioContext,
    });

    processor.setPreset("strong");

    expect(t.workletNode.port.postMessage).toHaveBeenCalledWith({
      type: "preset",
      preset: "strong",
    });
  });

  it("bypasses RNNoise for unsupported audio context sample rates", async () => {
    const t = createTestContext(44100);
    const workletCtor = vi.fn().mockReturnValue(t.workletNode);
    const warningSpy = vi.spyOn(logger, "warn");
    vi.stubGlobal("AudioWorkletNode", workletCtor);
    const processor = new RNNoiseProcessor();

    await expect(
      processor.init({
        kind: Track.Kind.Audio,
        track: t.track,
        audioContext: t.audioContext,
      }),
    ).rejects.toThrow("48000Hz");

    expect(warningSpy).toHaveBeenCalledOnce();
    expect(t.addModule).not.toHaveBeenCalled();
    expect(workletCtor).not.toHaveBeenCalled();
    expect(processor.processedTrack).toBeUndefined();
  });

  it("releases the worklet blob URL when worklet registration fails", async () => {
    const t = createTestContext();
    const workletCtor = vi.fn().mockReturnValue(t.workletNode);
    const addModuleError = new Error("Failed to register worklet module");
    t.addModule.mockRejectedValueOnce(addModuleError);
    vi.stubGlobal("AudioWorkletNode", workletCtor);
    const processor = new RNNoiseProcessor();

    await expect(
      processor.init({
        kind: Track.Kind.Audio,
        track: t.track,
        audioContext: t.audioContext,
      }),
    ).rejects.toThrow(addModuleError);

    expect(workletCtor).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:rnnoise");
  });

  it("restarts with the last known audio context when restart omits audioContext", async () => {
    const t = createTestContext();
    const workletCtor = vi.fn().mockReturnValue(t.workletNode);
    vi.stubGlobal("AudioWorkletNode", workletCtor);
    const processor = new RNNoiseProcessor();

    await processor.init({
      kind: Track.Kind.Audio,
      track: t.track,
      audioContext: t.audioContext,
    });

    const restartedTrack = {
      id: "restarted-input-track",
      kind: Track.Kind.Audio,
    } as MediaStreamTrack;
    await processor.restart({
      kind: Track.Kind.Audio,
      track: restartedTrack,
      // LiveKit restart paths can omit audioContext.
      audioContext: undefined as unknown as AudioContext,
    });

    expect(t.addModule).toHaveBeenCalledOnce();
    expect(t.createSourceNode).toHaveBeenCalledTimes(2);
    expect(workletCtor).toHaveBeenCalledTimes(2);
  });

  it("deterministically downmixes stereo input to mono in the worklet passthrough path", () => {
    const workletCode = getGeneratedWorkletCode();
    const worklet = instantiateWorkletProcessor(workletCode);
    const left = new Float32Array([1, -1, 0.5, 0]);
    const right = new Float32Array([0, 1, -0.5, 0.5]);
    const output = new Float32Array(left.length);

    const keepProcessing = worklet.process([[left, right]], [[output]], {});

    expect(keepProcessing).toBe(true);
    expect(output).toEqual(new Float32Array([0.5, 0, 0, 0.25]));
    expect(output).toHaveLength(left.length);
  });

  it("downmixes all input channels by averaging each sample", () => {
    const workletCode = getGeneratedWorkletCode();
    const worklet = instantiateWorkletProcessor(workletCode);
    const first = new Float32Array([0.6, -0.3, 0.9]);
    const second = new Float32Array([0.3, 0.3, -0.3]);
    const third = new Float32Array([0, 0.6, 0]);
    const output = new Float32Array(first.length);

    worklet.process([[first, second, third]], [[output]], {});

    expect(output[0]).toBeCloseTo(0.3, 6);
    expect(output[1]).toBeCloseTo(0.2, 6);
    expect(output[2]).toBeCloseTo(0.2, 6);
    expect(output).toHaveLength(first.length);
  });

  it("keeps the balanced preset tuning unchanged", () => {
    const balanced = getPresetConfig(getGeneratedWorkletCode(), "balanced");

    expect(balanced).toEqual({
      maxAttenuationDb: 8,
      openThreshold: 0.9,
      closeThreshold: 0.55,
      holdFrames: 10,
      attenuateMs: 90,
      releaseMs: 22,
    });
  });

  it("maps strong preset to a more aggressive profile than balanced", () => {
    const workletCode = getGeneratedWorkletCode();
    const balanced = getPresetConfig(workletCode, "balanced");
    const strong = getPresetConfig(workletCode, "strong");

    expect(strong.maxAttenuationDb).toBeGreaterThan(balanced.maxAttenuationDb);
    expect(strong.openThreshold).toBeGreaterThanOrEqual(balanced.openThreshold);
    expect(strong.closeThreshold).toBeGreaterThanOrEqual(
      balanced.closeThreshold,
    );
    expect(strong.holdFrames).toBeLessThan(balanced.holdFrames);
    expect(strong.attenuateMs).toBeLessThan(balanced.attenuateMs);
  });

  it("applies lower expected noise-floor gain on strong than balanced", () => {
    const workletCode = getGeneratedWorkletCode();
    const balanced = getPresetConfig(workletCode, "balanced");
    const strong = getPresetConfig(workletCode, "strong");
    const noiseLikeVadProbabilities = [0.2, 0.4, 0.6, 0.8];

    for (const vad of noiseLikeVadProbabilities) {
      expect(expectedAttenuationDb(strong, vad)).toBeGreaterThanOrEqual(
        expectedAttenuationDb(balanced, vad),
      );
    }

    const balancedSilenceGain = Math.pow(10, -balanced.maxAttenuationDb / 20);
    const strongSilenceGain = Math.pow(10, -strong.maxAttenuationDb / 20);
    expect(strongSilenceGain).toBeLessThan(balancedSilenceGain);
  });
});
