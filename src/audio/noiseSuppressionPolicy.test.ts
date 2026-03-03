/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { shouldEnableNativeNoiseSuppression } from "./noiseSuppressionPolicy";

describe("shouldEnableNativeNoiseSuppression", () => {
  it("keeps native suppression enabled when RNNoise is enabled but unsupported", () => {
    expect(
      shouldEnableNativeNoiseSuppression({
        urlNoiseSuppression: true,
        rnnoiseEnabled: true,
        rnnoiseSupported: false,
      }),
    ).toBe(true);
  });

  it("disables native suppression only when RNNoise is enabled and supported", () => {
    expect(
      shouldEnableNativeNoiseSuppression({
        urlNoiseSuppression: true,
        rnnoiseEnabled: true,
        rnnoiseSupported: true,
      }),
    ).toBe(false);
  });

  it("keeps native suppression disabled when explicitly disabled by URL", () => {
    expect(
      shouldEnableNativeNoiseSuppression({
        urlNoiseSuppression: false,
        rnnoiseEnabled: false,
        rnnoiseSupported: false,
      }),
    ).toBe(false);
    expect(
      shouldEnableNativeNoiseSuppression({
        urlNoiseSuppression: false,
        rnnoiseEnabled: true,
        rnnoiseSupported: false,
      }),
    ).toBe(false);
  });
});
