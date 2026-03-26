/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { DeepFilterNoiseFilterProcessor } from "deepfilternet3-noise-filter";
import { logger } from "matrix-js-sdk/lib/logger";

/**
 * Wrapper for DeepFilterNet3 Noise Suppression Processor.
 * Integrates with LiveKit audio track processing.
 */
export class NoiseSuppressionTransformer {
  private processor: DeepFilterNoiseFilterProcessor | null = null;
  private initialized = false;
  private readonly sampleRate: number = 48000;

  /**
   * Initialize the noise suppression processor
   * @param level - Noise reduction level (0-1)
   * @param enabled - Whether noise suppression is enabled
   */
  public initialize(level: number = 0.75, enabled: boolean = true): void {
    if (this.initialized) {
      return;
    }

    try {
      // Clamp level between 0-1
      const clampedLevel = Math.max(0, Math.min(1, level));

      // Load from bundled local assets by default (avoids CDN/CORS issues),
      // but allow override via env var for custom deployments.
      const assetUrl =
        import.meta.env.VITE_NOISE_SUPPRESSION_CDN_URL ||
        `${window.location.origin}/assets/deepfilternet3`;

      this.processor = new DeepFilterNoiseFilterProcessor({
        sampleRate: this.sampleRate,
        noiseReductionLevel: clampedLevel * 100,
        enabled,
        assetConfig: {
          cdnUrl: assetUrl,
        },
      });

      this.initialized = true;
      logger.log(
        `[NoiseSuppressionTransformer] Initialized with level=${clampedLevel}, enabled=${enabled}, assetUrl=${assetUrl}`,
      );
    } catch (error) {
      logger.error(
        "[NoiseSuppressionTransformer] Initialization failed:",
        error,
      );
      throw error;
    }
  }

  /**
   * Get the underlying processor instance
   */
  public getProcessor(): DeepFilterNoiseFilterProcessor | null {
    return this.processor;
  }

  /**
   * Set the noise reduction level (0-1)
   */
  public setSuppressionLevel(level: number): void {
    if (!this.processor) {
      logger.warn(
        "[NoiseSuppressionTransformer] Processor not initialized, cannot set suppression level",
      );
      return;
    }

    const clampedLevel = Math.max(0, Math.min(1, level));
    try {
      this.processor.setSuppressionLevel(clampedLevel * 100);
      logger.log(
        `[NoiseSuppressionTransformer] Suppression level set to ${clampedLevel}`,
      );
    } catch (error) {
      logger.error(
        "[NoiseSuppressionTransformer] Failed to set suppression level:",
        error,
      );
    }
  }

  /**
   * Enable or disable noise suppression
   */
  public setEnabled(enabled: boolean): void {
    if (!this.processor) {
      logger.warn(
        "[NoiseSuppressionTransformer] Processor not initialized, cannot set enabled state",
      );
      return;
    }

    try {
      void this.processor.setEnabled(enabled);
      logger.log(
        `[NoiseSuppressionTransformer] Noise suppression ${enabled ? "enabled" : "disabled"}`,
      );
      // Log processor state for debugging
      const processorState = (this.processor as { enabled?: boolean }).enabled;
      logger.debug(
        `[NoiseSuppressionTransformer] Processor internal state: enabled=${processorState}`,
      );
    } catch (error) {
      logger.error(
        "[NoiseSuppressionTransformer] Failed to set enabled state:",
        error,
      );
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.processor) {
      try {
        // Note: DeepFilterNoiseFilterProcessor may have a destroy method
        // Call it if available
        if (typeof (this.processor as { destroy?: () => void }).destroy === "function") {
          (this.processor as { destroy: () => void }).destroy();
        }
      } catch (error) {
        logger.error("[NoiseSuppressionTransformer] Cleanup failed:", error);
      }
      this.processor = null;
      this.initialized = false;
    }
  }
}
