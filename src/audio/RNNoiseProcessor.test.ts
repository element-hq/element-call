/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Track } from "livekit-client";

import { RNNoiseProcessor, supportsRNNoiseProcessor } from "./RNNoiseProcessor";

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
  processedTrack: MediaStreamTrack;
  workletNode: AudioWorkletNode;
  audioContext: AudioContext;
  track: MediaStreamTrack;
};

function createTestContext(): TestContext {
  const processedTrack = { id: "processed-track" } as MediaStreamTrack;
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
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:rnnoise");
    expect(processor.processedTrack).toBeUndefined();
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
});
