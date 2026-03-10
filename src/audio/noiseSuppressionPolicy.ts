/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

interface NativeNoiseSuppressionPolicyOptions {
  urlNoiseSuppression: boolean | undefined;
  rnnoiseEnabled: boolean;
  rnnoiseSupported: boolean;
}

/**
 * Resolves whether native browser noise suppression should be enabled.
 *
 * Native suppression should only be disabled when RNNoise is both enabled and
 * actually supported at runtime.
 */
export function shouldEnableNativeNoiseSuppression({
  urlNoiseSuppression,
  rnnoiseEnabled,
  rnnoiseSupported,
}: NativeNoiseSuppressionPolicyOptions): boolean {
  return (urlNoiseSuppression ?? true) && !(rnnoiseEnabled && rnnoiseSupported);
}
