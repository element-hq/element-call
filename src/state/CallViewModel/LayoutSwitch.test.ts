/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, test } from "vitest";

import { createLayoutModeSwitch } from "./LayoutSwitch";
import { testScope, withTestScheduler } from "../../utils/test";

function testLayoutSwitch({
  windowMode = "n",
  hasScreenShares = "n",
  userSelection = "",
  expectedGridMode,
}: {
  windowMode?: string;
  hasScreenShares?: string;
  userSelection?: string;
  expectedGridMode: string;
}): void {
  withTestScheduler(({ behavior, schedule, expectObservable }) => {
    const { gridMode$, setGridMode } = createLayoutModeSwitch(
      testScope(),
      behavior(windowMode, { n: "normal", N: "narrow", f: "flat" }),
      behavior(hasScreenShares, { y: true, n: false }),
    );
    schedule(userSelection, {
      g: () => setGridMode("grid"),
      s: () => setGridMode("spotlight"),
    });
    expectObservable(gridMode$).toBe(expectedGridMode, {
      g: "grid",
      s: "spotlight",
    });
  });
}

describe("default mode", () => {
  test("uses grid layout by default", () =>
    testLayoutSwitch({
      expectedGridMode: "g",
    }));

  test("uses spotlight mode when window mode is flat", () =>
    testLayoutSwitch({
      windowMode: "      f",
      expectedGridMode: "s",
    }));
});

test("allows switching modes manually", () =>
  testLayoutSwitch({
    userSelection: "   --sgs",
    expectedGridMode: "g-sgs",
  }));

test("switches to spotlight mode when there is a remote screen share", () =>
  testLayoutSwitch({
    hasScreenShares: " n--y",
    expectedGridMode: "g--s",
  }));

test("can manually switch to grid when there is a screenshare", () =>
  testLayoutSwitch({
    hasScreenShares: " n-y",
    userSelection: "   ---g",
    expectedGridMode: "g-sg",
  }));

test("auto-switches after manually selecting grid", () =>
  testLayoutSwitch({
    // Two screenshares will happen in sequence. There is a screen share that
    // forces spotlight, then the user manually switches back to grid.
    hasScreenShares: " n-y-ny",
    userSelection: "   ---g",
    expectedGridMode: "g-sg-s",
    // If we did want to respect manual selection, the expectation would be: g-sg
  }));

test("switches back to grid mode when the remote screen share ends", () =>
  testLayoutSwitch({
    hasScreenShares: " n--y--n",
    expectedGridMode: "g--s--g",
  }));

test("auto-switches to spotlight again after first screen share ends", () =>
  testLayoutSwitch({
    hasScreenShares: " nyny",
    expectedGridMode: "gsgs",
  }));

test("switches manually to grid after screen share while manually in spotlight", () =>
  testLayoutSwitch({
    // Initially, no one is sharing. Then the user manually switches to spotlight.
    // After a screen share starts, the user manually switches to grid.
    hasScreenShares: " n-y",
    userSelection: "   -s-g",
    expectedGridMode: "gs-g",
  }));

test("auto-switches to spotlight when in flat window mode", () =>
  testLayoutSwitch({
    // First normal, then narrow, then flat.
    windowMode: "      nNf",
    expectedGridMode: "g-s",
  }));

test("allows switching modes manually when in flat window mode", () =>
  testLayoutSwitch({
    // Window becomes flat, then user switches to grid and back.
    // Finally the window returns to a normal shape.
    windowMode: "      nf--n",
    userSelection: "   --gs",
    expectedGridMode: "gsgsg",
  }));

test("stays in spotlight while there are screen shares even when window mode changes", () =>
  testLayoutSwitch({
    windowMode: "      nfn",
    hasScreenShares: " y",
    expectedGridMode: "s",
  }));

test("ignores end of screen share until window mode returns to normal", () =>
  testLayoutSwitch({
    windowMode: "      nf-n",
    hasScreenShares: " y-n",
    expectedGridMode: "s--g",
  }));
