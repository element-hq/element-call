/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  loadRnnoise,
  RnnoiseWorkletNode,
} from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";

const logger = rootLogger.getChild("[MicrophoneDenoiseController]");

export interface MicrophoneTrackProcessor {
  connect(
    input: MediaStreamAudioSourceNode,
    destination: MediaStreamAudioDestinationNode,
  ): void;
  disconnect(): void;
  destroy?(): void;
}

export interface MicrophoneTrackProcessorFactory {
  create(context: AudioContext): Promise<MicrophoneTrackProcessor>;
}

let rnnoiseWasmBinaryPromise: Promise<ArrayBuffer> | undefined;
const rnnoiseWorkletModules = new WeakMap<AudioContext, Promise<void>>();

async function loadRnnoiseBinary(): Promise<ArrayBuffer> {
  rnnoiseWasmBinaryPromise ??= loadRnnoise({
    url: rnnoiseWasmPath,
    simdUrl: rnnoiseSimdWasmPath,
  });
  return rnnoiseWasmBinaryPromise;
}

async function ensureRnnoiseWorklet(context: AudioContext): Promise<void> {
  let modulePromise = rnnoiseWorkletModules.get(context);
  if (modulePromise === undefined) {
    modulePromise = context.audioWorklet.addModule(rnnoiseWorkletPath);
    rnnoiseWorkletModules.set(context, modulePromise);
  }
  return modulePromise;
}

class RnnoiseMicrophoneTrackProcessor implements MicrophoneTrackProcessor {
  private readonly preFilter: BiquadFilterNode;

  public constructor(
    context: AudioContext,
    private readonly rnnoiseNode: RnnoiseWorkletNode,
  ) {
    // Trim subsonic rumble before RNNoise sees the signal.
    this.preFilter = context.createBiquadFilter();
    this.preFilter.type = "highpass";
    this.preFilter.frequency.value = 80;
    this.preFilter.Q.value = 0.7;
  }

  public connect(
    input: MediaStreamAudioSourceNode,
    destination: MediaStreamAudioDestinationNode,
  ): void {
    input.connect(this.preFilter);
    this.preFilter.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(destination);
  }

  public disconnect(): void {
    this.preFilter.disconnect();
    this.rnnoiseNode.disconnect();
  }

  public destroy(): void {
    this.rnnoiseNode.destroy();
  }
}

export class RnnoiseMicrophoneTrackProcessorFactory implements MicrophoneTrackProcessorFactory {
  public async create(
    context: AudioContext,
  ): Promise<MicrophoneTrackProcessor> {
    if (
      context.audioWorklet === undefined ||
      typeof AudioWorkletNode === "undefined"
    ) {
      throw new Error("AudioWorklet is not available");
    }

    const wasmBinary = await loadRnnoiseBinary();
    await ensureRnnoiseWorklet(context);

    const rnnoiseNode = new RnnoiseWorkletNode(context, {
      wasmBinary,
      maxChannels: 1,
    });

    return new RnnoiseMicrophoneTrackProcessor(context, rnnoiseNode);
  }
}

interface ActivePipeline {
  readonly sourceTrack: MediaStreamTrack;
  readonly processedTrack: MediaStreamTrack;
  readonly context: AudioContext;
  readonly sourceNode: MediaStreamAudioSourceNode;
  readonly destinationNode: MediaStreamAudioDestinationNode;
  readonly processor: MicrophoneTrackProcessor;
}

/**
 * Experimental client-side microphone processing hook.
 *
 * When enabled, we wrap the captured mic track in a Web Audio
 * graph and hand LiveKit a processed output track instead of the raw one.
 */
export class MicrophoneDenoiseController {
  private activePipeline?: ActivePipeline;

  public constructor(
    private readonly processorFactory: MicrophoneTrackProcessorFactory = new RnnoiseMicrophoneTrackProcessorFactory(),
  ) {}

  public get sourceTrack(): MediaStreamTrack | undefined {
    return this.activePipeline?.sourceTrack;
  }

  public get processedTrack(): MediaStreamTrack | undefined {
    return this.activePipeline?.processedTrack;
  }

  public async rebuild(
    sourceTrack: MediaStreamTrack,
  ): Promise<MediaStreamTrack> {
    this.destroy();

    if (typeof AudioContext === "undefined") {
      throw new Error("AudioContext is not available");
    }

    const context = new AudioContext({
      latencyHint: "interactive",
      sampleRate: 48000,
    });

    try {
      const stream = new MediaStream([sourceTrack]);
      const sourceNode = context.createMediaStreamSource(stream);
      const destinationNode = context.createMediaStreamDestination();
      const processor = await this.processorFactory.create(context);

      processor.connect(sourceNode, destinationNode);

      const processedTrack = destinationNode.stream.getAudioTracks()[0];
      if (processedTrack === undefined) {
        throw new Error(
          "Processed microphone stream did not expose an audio track",
        );
      }

      if (context.state === "suspended") {
        await context.resume();
      }

      this.activePipeline = {
        sourceTrack,
        processedTrack,
        context,
        sourceNode,
        destinationNode,
        processor,
      };

      return processedTrack;
    } catch (error) {
      try {
        await context.close();
      } catch (closeError) {
        logger.warn(
          "Failed to close microphone denoise audio context",
          closeError,
        );
      }
      throw error;
    }
  }

  public destroy(): void {
    const pipeline = this.activePipeline;
    if (pipeline === undefined) return;

    this.activePipeline = undefined;
    pipeline.processor.disconnect();
    pipeline.processor.destroy?.();
    pipeline.sourceNode.disconnect();
    pipeline.destinationNode.disconnect();
    pipeline.processedTrack.stop();
    void pipeline.context.close().catch((error) => {
      logger.warn("Failed to close microphone denoise audio context", error);
    });
  }
}
