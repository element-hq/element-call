/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export const rnnoiseSuppressionPresets = [
  "conservative",
  "balanced",
  "strong",
] as const;

export type RNNoiseSuppressionPreset =
  (typeof rnnoiseSuppressionPresets)[number];
