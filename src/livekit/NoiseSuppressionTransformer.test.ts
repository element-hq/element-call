import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { NoiseSuppressionTransformer } from "./NoiseSuppressionTransformer";
import {
  DeepFilterNoiseFilterProcessor,
  __setEnabledSpy as mockSetEnabled,
  __setSuppressionLevelSpy as mockSetSuppressionLevel,
  __destroySpy as mockDestroy,
} from "deepfilternet3-noise-filter";

const mockDeepFilterNoiseFilterProcessor = vi.mocked(DeepFilterNoiseFilterProcessor);

describe("NoiseSuppressionTransformer", () => {
  beforeEach(() => {
    mockSetEnabled.mockClear();
    mockSetSuppressionLevel.mockClear();
    mockDestroy.mockClear();
    mockDeepFilterNoiseFilterProcessor.mockClear();
  });

  it("initializes the underlying processor with the expected configuration", () => {
    const transformer = new NoiseSuppressionTransformer();

    transformer.initialize(0.5, false);

    expect(mockDeepFilterNoiseFilterProcessor).toHaveBeenCalledTimes(1);
    expect(mockDeepFilterNoiseFilterProcessor).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleRate: 48000,
        noiseReductionLevel: 50,
        enabled: false,
        assetConfig: expect.objectContaining({
          cdnUrl: expect.any(String),
        }),
      }),
    );

    expect(transformer.getProcessor()).not.toBeNull();
  });

  it("does not initialize twice", () => {
    const transformer = new NoiseSuppressionTransformer();

    transformer.initialize(0.3, true);
    transformer.initialize(0.7, false);

    expect(mockDeepFilterNoiseFilterProcessor).toHaveBeenCalledTimes(1);
    expect(transformer.getProcessor()).not.toBeNull();
  });

  it("forwards suppression level changes and clamps out-of-range values", () => {
    const transformer = new NoiseSuppressionTransformer();
    transformer.initialize(0.2, true);

    transformer.setSuppressionLevel(1.5);
    transformer.setSuppressionLevel(-0.2);

    expect(mockSetSuppressionLevel).toHaveBeenNthCalledWith(1, 100);
    expect(mockSetSuppressionLevel).toHaveBeenNthCalledWith(2, 0);
  });

  it("forwards enabled state changes to the underlying processor", () => {
    const transformer = new NoiseSuppressionTransformer();
    transformer.initialize(0.4, true);

    transformer.setEnabled(false);
    transformer.setEnabled(true);

    expect(mockSetEnabled).toHaveBeenNthCalledWith(1, false);
    expect(mockSetEnabled).toHaveBeenNthCalledWith(2, true);
  });

  it("destroys the processor and resets internal state", () => {
    const transformer = new NoiseSuppressionTransformer();
    transformer.initialize(0.6, true);

    transformer.destroy();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(transformer.getProcessor()).toBeNull();
  });
});
