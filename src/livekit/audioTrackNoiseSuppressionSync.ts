/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import type { LocalAudioTrack } from "livekit-client";
import {
  noiseSuppressionEnabled,
  noiseSuppressionLevel,
} from "../settings/settings";
import { getUrlParams } from "../UrlParams";
import type { Behavior } from "../state/Behavior";
import type { ObservableScope } from "../state/ObservableScope";
import { NoiseSuppressionTransformer } from "./NoiseSuppressionTransformer";

/**
 * Synchronizes the noise suppression processor with audio tracks and settings.
 * This function manages the lifecycle of the NoiseSuppressionTransformer
 * and ensures it's applied to the audio track when settings change.
 * URL parameters can override user settings if provided.
 *
 * @param scope - The ObservableScope for managing subscriptions
 * @param audioTrack$ - Observable of the local audio track
 */
export const audioTrackNoiseSuppressionSync = (
  scope: ObservableScope,
  audioTrack$: Behavior<LocalAudioTrack | null>,
): void => {
  // Create a single transformer instance shared across all subscriptions
  let transformer: NoiseSuppressionTransformer | null = null;
  let hasInitialized = false;
  // Get URL parameters for noise suppression (only used for initial setup)
  const urlParams = getUrlParams();

  combineLatest([
    audioTrack$,
    noiseSuppressionEnabled.value$,
    noiseSuppressionLevel.value$,
  ])
    .pipe(scope.bind())
    .subscribe(([audioTrack, settingEnabled, settingLevel]) => {
      try {
        // On first initialization, use URL parameters if provided, otherwise use settings
        // After that, always use settings (user can change them at runtime)
        let enabledValue = settingEnabled;
        let levelValue = settingLevel;

        if (!hasInitialized) {
          // First time: use URL params as overrides if provided
          if (urlParams.noiseSuppressionEnabled !== undefined) {
            enabledValue = urlParams.noiseSuppressionEnabled;
          }
          if (urlParams.noiseSuppressionLevel !== undefined) {
            levelValue = urlParams.noiseSuppressionLevel;
          }
          hasInitialized = true;
          logger.debug(
            "[audioTrackNoiseSuppressionSync] Initialized from URL params: enabled=" +
              enabledValue +
              ", level=" +
              levelValue,
          );
        }

        // Initialize transformer on first use
        if (!transformer) {
          transformer = new NoiseSuppressionTransformer();
          transformer.initialize(levelValue, enabledValue);
          logger.debug(
            "[audioTrackNoiseSuppressionSync] Transformer initialized with enabled=" +
              enabledValue +
              ", level=" +
              levelValue,
          );
        }

        const processor = transformer.getProcessor();
        if (!processor) {
          logger.error(
            "[audioTrackNoiseSuppressionSync] Processor not initialized",
          );
          return;
        }

        // Apply processor to audio track if track exists
        if (audioTrack) {
          if (!audioTrack.getProcessor()) {
            logger.debug(
              "[audioTrackNoiseSuppressionSync] Setting noise suppression processor on audio track",
            );
            void audioTrack.setProcessor(processor);
          }
          // Update processor state - with small delay to ensure processor is ready
          void Promise.resolve().then(() => {
            transformer!.setEnabled(enabledValue);
            transformer!.setSuppressionLevel(levelValue);
            logger.debug(
              "[audioTrackNoiseSuppressionSync] Updated: enabled=" +
                enabledValue +
                ", level=" +
                levelValue,
            );
          });
        } else {
          // Track was removed - stop processor if applicable
          logger.debug(
            "[audioTrackNoiseSuppressionSync] Audio track not available",
          );
        }
      } catch (error) {
        logger.error("[audioTrackNoiseSuppressionSync] Error:", error);
      }
    });

  // Cleanup on scope end
  scope.onEnd(() => {
    if (transformer) {
      transformer.destroy();
      transformer = null;
    }
  });
};
