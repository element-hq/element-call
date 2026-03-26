/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useRef } from "react";

import {
  noiseSuppressionEnabled,
  noiseSuppressionLevel,
} from "../settings/settings";
import { useBehavior } from "../useBehavior";
import { NoiseSuppressionTransformer } from "../livekit/NoiseSuppressionTransformer";

/**
 * Hook to manage the NoiseSuppressionTransformer instance.
 * Synchronizes the transformer with the noise suppression settings.
 * Returns the transformer instance for use in Publishers.
 */
export const useNoiseSuppressionTransformer =
  (): NoiseSuppressionTransformer => {
    const transformerRef = useRef<NoiseSuppressionTransformer | null>(null);
    const enabledValue = useBehavior(noiseSuppressionEnabled.value$);
    const levelValue = useBehavior(noiseSuppressionLevel.value$);

    // Initialize transformer on first mount
    useEffect(() => {
      if (!transformerRef.current) {
        transformerRef.current = new NoiseSuppressionTransformer();
        // Initialize with current settings
        void transformerRef.current.initialize(levelValue, enabledValue);
      }
    }, []);

    // Sync enabled state when setting changes
    useEffect(() => {
      if (transformerRef.current) {
        transformerRef.current.setEnabled(enabledValue);
      }
    }, [enabledValue]);

    // Sync level when setting changes
    useEffect(() => {
      if (transformerRef.current) {
        transformerRef.current.setSuppressionLevel(levelValue);
      }
    }, [levelValue]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (transformerRef.current) {
          transformerRef.current.destroy();
        }
      };
    }, []);

    return transformerRef.current!;
  };
