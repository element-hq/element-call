/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("BackgroundEffectGrid", () => {
  // Its tiles are Radix radio items inside Compound's menu, which only works
  // with Compound's own copy of Radix: a second copy has none of its context.
  it("shares one Radix menu with Compound", () => {
    const ours = createRequire(import.meta.url);
    const compounds = createRequire(
      realpathSync(ours.resolve("@vector-im/compound-web")),
    );
    expect(realpathSync(ours.resolve("@radix-ui/react-dropdown-menu"))).toBe(
      realpathSync(compounds.resolve("@radix-ui/react-dropdown-menu")),
    );
  });
});
