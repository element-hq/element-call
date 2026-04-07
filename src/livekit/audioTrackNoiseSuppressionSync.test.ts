import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(() => {}),
  removeItem: vi.fn(() => {}),
  clear: vi.fn(() => {}),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
  writable: true,
});

vi.mock("deepfilternet3-noise-filter", () => {
  const setEnabled = vi.fn();
  const setSuppressionLevel = vi.fn();
  const destroy = vi.fn();

  function DeepFilterNoiseFilterProcessor(this: any, options: any) {
    Object.assign(this, options);
    this.setEnabled = setEnabled;
    this.setSuppressionLevel = setSuppressionLevel;
    this.destroy = destroy;
  }

  return {
    __esModule: true,
    DeepFilterNoiseFilterProcessor: vi.fn().mockImplementation(DeepFilterNoiseFilterProcessor),
    __setEnabledSpy: setEnabled,
    __setSuppressionLevelSpy: setSuppressionLevel,
    __destroySpy: destroy,
  };
});

import { ObservableScope } from "../state/ObservableScope";
import type { LocalAudioTrack } from "livekit-client";
import type { Behavior } from "../state/Behavior";
import {
  __setEnabledSpy as mockSetEnabled,
  __setSuppressionLevelSpy as mockSetSuppressionLevel,
  __destroySpy as mockDestroy,
} from "deepfilternet3-noise-filter";

let audioTrackNoiseSuppressionSync: typeof import("./audioTrackNoiseSuppressionSync").audioTrackNoiseSuppressionSync;
let noiseSuppressionEnabled: typeof import("../settings/settings").noiseSuppressionEnabled;
let noiseSuppressionLevel: typeof import("../settings/settings").noiseSuppressionLevel;

class MockLocalAudioTrack {
  private processor: unknown = undefined;
  public readonly setProcessor = vi.fn(async (processor: unknown) => {
    this.processor = processor;
  });
  public readonly getProcessor = vi.fn(() => this.processor);
  public readonly stopProcessor = vi.fn(async () => {
    this.processor = undefined;
  });
}

describe("audioTrackNoiseSuppressionSync", () => {
  let scope: ObservableScope;
  let audioTrack$: Behavior<LocalAudioTrack | null>;
  let track: MockLocalAudioTrack;

  beforeEach(async () => {
    mockSetEnabled.mockClear();
    mockSetSuppressionLevel.mockClear();
    mockDestroy.mockClear();
    track = new MockLocalAudioTrack();
    audioTrack$ = new BehaviorSubject<LocalAudioTrack | null>(track as unknown as LocalAudioTrack);
    const settingsModule = await import("../settings/settings");
    noiseSuppressionEnabled = settingsModule.noiseSuppressionEnabled;
    noiseSuppressionLevel = settingsModule.noiseSuppressionLevel;
    const syncModule = await import("./audioTrackNoiseSuppressionSync");
    audioTrackNoiseSuppressionSync = syncModule.audioTrackNoiseSuppressionSync;
    noiseSuppressionEnabled.setValue(true);
    noiseSuppressionLevel.setValue(0.75);
    scope = new ObservableScope();
  });

  afterEach(async () => {
    scope.end();
    await Promise.resolve();
  });

  it("sets the processor on the audio track and updates the processor settings", async () => {
    audioTrackNoiseSuppressionSync(scope, audioTrack$);
    await Promise.resolve();

    expect(track.setProcessor).toHaveBeenCalledTimes(1);
    expect(track.getProcessor()).not.toBeUndefined();
    expect(mockSetEnabled).toHaveBeenCalledWith(false);
    expect(mockSetSuppressionLevel).toHaveBeenCalledWith(75);
  });

  it("reapplies processor when audio track becomes available", async () => {
    audioTrack$ = new BehaviorSubject<LocalAudioTrack | null>(null);
    audioTrackNoiseSuppressionSync(scope, audioTrack$);
    await Promise.resolve();

    expect(track.setProcessor).toHaveBeenCalledTimes(0);

    audioTrack$.next(track as unknown as LocalAudioTrack);
    await Promise.resolve();

    expect(track.setProcessor).toHaveBeenCalledTimes(1);
  });

  it("destroys the transformer when the scope ends", async () => {
    audioTrackNoiseSuppressionSync(scope, audioTrack$);
    await Promise.resolve();

    scope.end();
    await Promise.resolve();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
