/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test } from "vitest";
import { withTestScheduler } from "../utils/test";
import { createFloatingTile } from "./FloatingTile";

test("FloatingTile changes alignment on drag", () =>
  withTestScheduler(({ scope, expectObservable, schedule }) => {
    // Tile starts in the top left
    const { alignment$, onDrag } = createFloatingTile(scope, {
      inline: "start",
      block: "start",
    });
    // Drag to all four corners, and then repeatedly into the top left.
    schedule("-↗↘↙↖↖", {
      "↗": () =>
        onDrag({ x: 100, y: 0, xRatio: 1, yRatio: 0, endOfGesture: false }),
      "↘": () =>
        onDrag({ x: 100, y: 100, xRatio: 1, yRatio: 1, endOfGesture: false }),
      "↙": () =>
        onDrag({ x: 0, y: 100, xRatio: 0, yRatio: 1, endOfGesture: false }),
      "↖": () =>
        onDrag({ x: 0, y: 0, xRatio: 0, yRatio: 0, endOfGesture: false }),
    });
    // Alignment should change accordingly. Notably, the alignment should *not*
    // update when repeatedly dragged into the same corner, for performance.
    expectObservable(alignment$).toBe("↖↗↘↙↖-", {
      "↗": { inline: "end", block: "start" },
      "↘": { inline: "end", block: "end" },
      "↙": { inline: "start", block: "end" },
      "↖": { inline: "start", block: "start" },
    });
  }));
