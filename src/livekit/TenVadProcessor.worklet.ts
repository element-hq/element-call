/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  public readonly port: MessagePort;
  public constructor(options?: {
    processorOptions?: Record<string, unknown>;
  });
  public process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}
declare function registerProcessor(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processorCtor: new (...args: any[]) => AudioWorkletProcessor,
): void;

interface TenVadParams {
  // TEN-VAD params
  vadEnabled: boolean;
  vadPositiveThreshold: number; // open gate when prob >= this (0–1)
  vadNegativeThreshold: number; // close gate when prob < this (0–1)
  vadMode: "standard" | "aggressive" | "loose";
  holdMs: number;               // hold time before closing gate (ms); 0 = no hold
}

interface VADGateMessage {
  type: "vad-gate";
  open: boolean;
}

/**
 * Thin synchronous wrapper around the TEN-VAD Emscripten WASM module.
 * Instantiated synchronously in the AudioWorklet constructor from a
 * pre-compiled WebAssembly.Module passed via processorOptions.
 */
class TenVADRuntime {
  private readonly mem: WebAssembly.Memory;
  private readonly freeFn: (ptr: number) => void;
  private readonly processFn: (
    handle: number,
    audioPtr: number,
    hopSize: number,
    probPtr: number,
    flagPtr: number,
  ) => number;
  private readonly destroyFn: (handle: number) => number;
  private readonly handle: number;
  private readonly audioBufPtr: number;
  private readonly probPtr: number;
  private readonly flagPtr: number;
  public readonly hopSize: number;

  public constructor(
    module: WebAssembly.Module,
    hopSize: number,
    threshold: number,
  ) {
    this.hopSize = hopSize;

    // Late-bound memory reference — emscripten_resize_heap and memmove
    // are only called after instantiation, so closing over this is safe.
    const state = { mem: null as WebAssembly.Memory | null };

    const imports = {
      a: {
        // abort
        a: (): never => {
          throw new Error("ten_vad abort");
        },
        // fd_write / proc_exit stub
        b: (): number => 0,
        // emscripten_resize_heap
        c: (reqBytes: number): number => {
          if (!state.mem) return 0;
          try {
            const cur = state.mem.buffer.byteLength;
            if (cur >= reqBytes) return 1;
            state.mem.grow(Math.ceil((reqBytes - cur) / 65536));
            return 1;
          } catch {
            return 0;
          }
        },
        // fd_write stub
        d: (): number => 0,
        // environ stub
        e: (): number => 0,
        // memmove
        f: (dest: number, src: number, len: number): void => {
          if (state.mem) {
            new Uint8Array(state.mem.buffer).copyWithin(dest, src, src + len);
          }
        },
      },
    };

    // Synchronous instantiation — valid in Worker/AudioWorklet global scope
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new WebAssembly.Instance(module, imports as any);
    const asm = instance.exports as {
      g: WebAssembly.Memory;     // exported memory
      h: () => void;             // __wasm_call_ctors
      i: (n: number) => number;  // malloc
      j: (p: number) => void;    // free
      k: (handlePtr: number, hopSize: number, threshold: number) => number; // ten_vad_create
      l: (handle: number, audioPtr: number, hopSize: number, probPtr: number, flagPtr: number) => number; // ten_vad_process
      m: (handle: number) => number; // ten_vad_destroy
    };

    state.mem = asm.g;
    this.mem = asm.g;
    this.freeFn = asm.j;
    this.processFn = asm.l;
    this.destroyFn = asm.m;

    // Run Emscripten static constructors
    asm.h();

    // Allocate persistent buffers (malloc is 8-byte aligned, so alignment is fine)
    this.audioBufPtr = asm.i(hopSize * 2); // Int16Array
    this.probPtr = asm.i(4);               // float
    this.flagPtr = asm.i(4);               // int

    // Create VAD handle — ten_vad_create(void** handle, int hopSize, float threshold)
    const handlePtrPtr = asm.i(4);
    const ret = asm.k(handlePtrPtr, hopSize, threshold);
    if (ret !== 0) throw new Error(`ten_vad_create failed: ${ret}`);
    this.handle = new Int32Array(this.mem.buffer)[handlePtrPtr >> 2];
    asm.j(handlePtrPtr);
  }

  /** Process one hop of Int16 audio. Returns speech probability [0–1]. */
  public process(samples: Int16Array): number {
    new Int16Array(this.mem.buffer).set(samples, this.audioBufPtr >> 1);
    this.processFn(
      this.handle,
      this.audioBufPtr,
      this.hopSize,
      this.probPtr,
      this.flagPtr,
    );
    return new Float32Array(this.mem.buffer)[this.probPtr >> 2];
  }

  public destroy(): void {
    this.destroyFn(this.handle);
    this.freeFn(this.audioBufPtr);
    this.freeFn(this.probPtr);
    this.freeFn(this.flagPtr);
  }
}

/**
 * AudioWorkletProcessor implementing an in-worklet TEN-VAD gate running
 * per-sample.
 *
 * TEN-VAD gate: accumulates audio with 3:1 decimation (48 kHz → 16 kHz),
 * runs the TEN-VAD model synchronously every 256 samples (16 ms), and
 * controls vadGateOpen with hysteresis. No IPC round-trip required.
 * Asymmetric ramp: 5 ms open (minimise speech onset masking), 20 ms close
 * (de-click on silence).
 */
class TenVadProcessor extends AudioWorkletProcessor {
  // VAD gate state
  private vadGateOpen = true; // starts open; TEN-VAD closes it on first silent frame
  private vadAttenuation = 1.0;
  // Asymmetric ramp rates — recomputed in updateParams based on vadAggressive
  private vadOpenRampRate = 1.0 / (0.005 * sampleRate);  // default: 5 ms
  private vadCloseRampRate = 1.0 / (0.02 * sampleRate);  // default: 20 ms

  // TEN-VAD state
  private vadEnabled = false;
  private vadPositiveThreshold = 0.5;
  private vadNegativeThreshold = 0.3;
  private holdMs = 0;
  private vadHoldHops = 0;    // hold expressed in VAD hops
  private vadHoldCounter = 0; // hops of continuous sub-threshold signal while gate is open
  private tenVadRuntime: TenVADRuntime | null = null;
  private tenVadModule: WebAssembly.Module | undefined = undefined;
  // 3:1 decimation from AudioContext sample rate to 16 kHz
  private readonly decRatio = Math.max(1, Math.round(sampleRate / 16000));
  private decPhase = 0;
  private decAcc = 0;
  // Buffer sized for max hop (256); vadHopSize tracks how many samples to collect
  private readonly vadHopBuf = new Int16Array(256);
  private vadHopSize = 256; // standard: 256 (16 ms), aggressive: 160 (10 ms)
  private vadHopCount = 0;

  private logCounter = 0;

  public constructor(options?: {
    processorOptions?: Record<string, unknown>;
  }) {
    super(options);

    // Try to instantiate TEN-VAD from the pre-compiled module passed by the main thread
    this.tenVadModule = options?.processorOptions?.tenVadModule as
      | WebAssembly.Module
      | undefined;
    if (this.tenVadModule) {
      try {
        // Default: standard mode — 256 samples @ 16 kHz = 16 ms
        this.tenVadRuntime = new TenVADRuntime(this.tenVadModule, 256, 0.5);
        this.port.postMessage({
          type: "log",
          msg: "[TenVad worklet] TEN-VAD runtime initialized, decRatio=" + this.decRatio,
        });
      } catch (e) {
        this.port.postMessage({
          type: "log",
          msg: "[TenVad worklet] TEN-VAD init failed: " + String(e),
        });
      }
    }

    this.port.onmessage = (
      e: MessageEvent<TenVadParams | VADGateMessage>,
    ): void => {
      if ((e.data as VADGateMessage).type === "vad-gate") {
        this.vadGateOpen = (e.data as VADGateMessage).open;
      } else {
        this.updateParams(e.data as TenVadParams);
      }
    };

    this.updateParams({
      vadEnabled: false,
      vadPositiveThreshold: 0.5,
      vadNegativeThreshold: 0.3,
      vadMode: "standard",
      holdMs: 0,
    });

    this.port.postMessage({
      type: "log",
      msg: "[TenVad worklet] constructor called, sampleRate=" + sampleRate,
    });
  }

  private updateParams(p: TenVadParams): void {
    this.vadEnabled = p.vadEnabled ?? false;
    this.vadPositiveThreshold = p.vadPositiveThreshold ?? 0.5;
    this.vadNegativeThreshold = p.vadNegativeThreshold ?? 0.3;
    this.holdMs = p.holdMs ?? 0;

    const newMode = p.vadMode ?? "standard";
    if (newMode === "aggressive") {
      this.vadOpenRampRate  = 1.0 / (0.001 * sampleRate); // 1 ms
      this.vadCloseRampRate = 1.0 / (0.005 * sampleRate); // 5 ms
    } else if (newMode === "loose") {
      this.vadOpenRampRate  = 1.0 / (0.012 * sampleRate); // 12 ms
      this.vadCloseRampRate = 1.0 / (0.032 * sampleRate); // 32 ms
    } else {
      this.vadOpenRampRate  = 1.0 / (0.005 * sampleRate); // 5 ms
      this.vadCloseRampRate = 1.0 / (0.02  * sampleRate); // 20 ms
    }

    // Hop size: aggressive=160 (10 ms @ 16 kHz), others=256 (16 ms)
    const newHopSize = newMode === "aggressive" ? 160 : 256;
    if (newHopSize !== this.vadHopSize && this.tenVadModule) {
      this.tenVadRuntime?.destroy();
      this.tenVadRuntime = null;
      this.vadHopCount = 0;
      try {
        this.tenVadRuntime = new TenVADRuntime(this.tenVadModule, newHopSize, 0.5);
      } catch (e) {
        this.port.postMessage({ type: "log", msg: "[TenVad worklet] TEN-VAD recreate failed: " + String(e) });
      }
    }
    this.vadHopSize = newHopSize;

    // Recompute hold in hops: ceil((holdMs / 1000) * 16000 / vadHopSize)
    this.vadHoldHops = this.holdMs > 0
      ? Math.ceil((this.holdMs / 1000) * 16000 / this.vadHopSize)
      : 0;
    this.vadHoldCounter = 0;

    if (!this.vadEnabled) this.vadGateOpen = true;
    this.port.postMessage({
      type: "log",
      msg: "[TenVad worklet] params updated: vadEnabled=" + p.vadEnabled
        + " vadPos=" + p.vadPositiveThreshold
        + " vadNeg=" + p.vadNegativeThreshold
        + " vadMode=" + newMode
        + " holdMs=" + this.holdMs,
    });
  }

  public process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const blockSize = input[0]?.length ?? 128;

    for (let i = 0; i < blockSize; i++) {
      // --- TEN-VAD in-worklet processing ---
      // Accumulate raw mono samples with decRatio:1 decimation (48 kHz → 16 kHz).
      // Every 256 output samples (16 ms) run the WASM VAD and update vadGateOpen.
      if (this.vadEnabled && this.tenVadRuntime !== null) {
        this.decAcc += input[0]?.[i] ?? 0;
        this.decPhase++;
        if (this.decPhase >= this.decRatio) {
          this.decPhase = 0;
          const avg = this.decAcc / this.decRatio;
          this.decAcc = 0;
          // Float32 [-1,1] → Int16 with clamping
          const s16 =
            avg >= 1.0
              ? 32767
              : avg <= -1.0
                ? -32768
                : (avg * 32767 + 0.5) | 0;
          this.vadHopBuf[this.vadHopCount++] = s16;

          if (this.vadHopCount >= this.vadHopSize) {
            this.vadHopCount = 0;
            const prob = this.tenVadRuntime.process(this.vadHopBuf);
            if (prob >= this.vadPositiveThreshold) {
              // Speech detected — open gate, reset hold counter
              this.vadGateOpen = true;
              this.vadHoldCounter = 0;
            } else if (prob < this.vadNegativeThreshold) {
              if (this.vadGateOpen) {
                if (this.vadHoldHops === 0) {
                  this.vadGateOpen = false;
                } else {
                  this.vadHoldCounter++;
                  if (this.vadHoldCounter >= this.vadHoldHops) {
                    this.vadGateOpen = false;
                    this.vadHoldCounter = 0;
                  }
                }
              }
            } else {
              // Ambiguous zone — reset hold counter so hold only fires on sustained silence
              this.vadHoldCounter = 0;
            }
          }
        }
      }

      // Asymmetric ramp: fast open (5 ms) to minimise speech onset masking,
      // slow close (20 ms) to de-click on silence transitions.
      const vadTarget = this.vadGateOpen ? 1.0 : 0.0;
      if (this.vadAttenuation < vadTarget) {
        this.vadAttenuation = Math.min(
          vadTarget,
          this.vadAttenuation + this.vadOpenRampRate,
        );
      } else if (this.vadAttenuation > vadTarget) {
        this.vadAttenuation = Math.max(
          vadTarget,
          this.vadAttenuation - this.vadCloseRampRate,
        );
      }

      const gain = this.vadAttenuation;

      for (let c = 0; c < output.length; c++) {
        const inCh = input[c] ?? input[0];
        const outCh = output[c];
        if (inCh && outCh) {
          outCh[i] = (inCh[i] ?? 0) * gain;
        }
      }
    }

    this.logCounter++;
    if (this.logCounter % 375 === 0) {
      this.port.postMessage({
        type: "log",
        msg: "[TenVad worklet] vadOpen=" + this.vadGateOpen
          + " vadAtten=" + this.vadAttenuation.toFixed(3),
      });
    }

    return true;
  }
}

registerProcessor("ten-vad-processor", TenVadProcessor);
