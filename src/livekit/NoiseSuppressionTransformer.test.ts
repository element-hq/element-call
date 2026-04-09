/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepFilterNoiseFilterProcessor } from "deepfilternet3-noise-filter";

import { NoiseSuppressionTransformer } from "./NoiseSuppressionTransformer";

type DeepFilterNoiseFilterProcessorOptions = Record<string, unknown>;

type DeepFilterNoiseFilterProcessorContext = {
  setEnabled?: unknown;
  setSuppressionLevel?: unknown;
  destroy?: unknown;
};

type NoiseFilterProcessorMock = ReturnType<typeof vi.fn> & {
  mockSetEnabled: ReturnType<typeof vi.fn>;
  mockSetSuppressionLevel: ReturnType<typeof vi.fn>;
  mockDestroy: ReturnType<typeof vi.fn>;
};

vi.mock("deepfilternet3-noise-filter", () => {
  const mockSetEnabled = vi.fn();
  const mockSetSuppressionLevel = vi.fn();
  const mockDestroy = vi.fn();

  const mockDeepFilterNoiseFilterProcessor = vi
    .fn()
    .mockImplementation(function DeepFilterNoiseFilterProcessor(
      this: DeepFilterNoiseFilterProcessorContext,
      options: DeepFilterNoiseFilterProcessorOptions,
    ): void {
      Object.assign(this, options);
      this.setEnabled = mockSetEnabled;
      this.setSuppressionLevel = mockSetSuppressionLevel;
      this.destroy = mockDestroy;
    });

  Object.assign(mockDeepFilterNoiseFilterProcessor, {
    mockSetEnabled,
    mockSetSuppressionLevel,
    mockDestroy,
  });

  return {
    __esModule: true,
    DeepFilterNoiseFilterProcessor: mockDeepFilterNoiseFilterProcessor,
  };
});

const mockDeepFilterNoiseFilterProcessor =
  DeepFilterNoiseFilterProcessor as unknown as NoiseFilterProcessorMock;

describe("NoiseSuppressionTransformer", () => {
  beforeEach((): void => {
    mockDeepFilterNoiseFilterProcessor.mockSetEnabled.mockClear();
    mockDeepFilterNoiseFilterProcessor.mockSetSuppressionLevel.mockClear();
    mockDeepFilterNoiseFilterProcessor.mockDestroy.mockClear();
    mockDeepFilterNoiseFilterProcessor.mockClear();
  });

  it("initializes the underlying processor with the expected configuration", (): void => {
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

  it("does not initialize twice", (): void => {
    const transformer = new NoiseSuppressionTransformer();

    transformer.initialize(0.3, true);
    transformer.initialize(0.7, false);

    expect(mockDeepFilterNoiseFilterProcessor).toHaveBeenCalledTimes(1);
    expect(transformer.getProcessor()).not.toBeNull();
  });

  it("forwards suppression level changes and clamps out-of-range values", (): void => {
    const transformer = new NoiseSuppressionTransformer();
    transformer.initialize(0.2, true);

    transformer.setSuppressionLevel(1.5);
    transformer.setSuppressionLevel(-0.2);

    expect(
      mockDeepFilterNoiseFilterProcessor.mockSetSuppressionLevel,
    ).toHaveBeenNthCalledWith(1, 100);
    expect(
      mockDeepFilterNoiseFilterProcessor.mockSetSuppressionLevel,
    ).toHaveBeenNthCalledWith(2, 0);
  });

  it("forwards enabled state changes to the underlying processor", (): void => {
    const transformer = new NoiseSuppressionTransformer();
    transformer.initialize(0.4, true);

    transformer.setEnabled(false);
    transformer.setEnabled(true);

    expect(
      mockDeepFilterNoiseFilterProcessor.mockSetEnabled,
    ).toHaveBeenNthCalledWith(1, false);
    expect(
      mockDeepFilterNoiseFilterProcessor.mockSetEnabled,
    ).toHaveBeenNthCalledWith(2, true);
  });

  it("destroys the processor and resets internal state", (): void => {
    const transformer = new NoiseSuppressionTransformer();
    transformer.initialize(0.6, true);

    transformer.destroy();

    expect(
      mockDeepFilterNoiseFilterProcessor.mockDestroy,
    ).toHaveBeenCalledTimes(1);
    expect(transformer.getProcessor()).toBeNull();
  });
});
