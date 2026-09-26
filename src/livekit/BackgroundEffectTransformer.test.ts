/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { BackgroundEffectTransformer } from "./BackgroundEffectTransformer";

describe("BackgroundEffectTransformer", () => {
  it("passes frames on untouched once disabled, even after blurring", async () => {
    const transformer = new BackgroundEffectTransformer({});
    await transformer.update({ blurRadius: 15, backgroundDisabled: false });
    await transformer.update({
      imagePath: undefined,
      backgroundDisabled: true,
    });
    // With neither, the library passes a frame on without segmenting it.
    expect(transformer.options.blurRadius).toBeUndefined();
    expect(transformer.options.imagePath).toBeUndefined();
  });
});
