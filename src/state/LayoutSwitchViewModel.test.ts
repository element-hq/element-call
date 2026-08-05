/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, test } from "vitest";

import { createLayoutSwitchViewModel } from "./LayoutSwitchViewModel";
import { testScope, withTestScheduler } from "../utils/test";

function testLayoutSwitch({
  windowMode = "n",
  hasScreenShares = "n",
  userSelection = "",
  expectedLayout,
}: {
  windowMode?: string;
  hasScreenShares?: string;
  userSelection?: string;
  expectedLayout: string;
}): void {
  withTestScheduler(({ behavior, schedule, expectObservable }) => {
    const { layout$, setLayout } = createLayoutSwitchViewModel(
      testScope(),
      behavior(windowMode, { n: "normal", N: "narrow", f: "flat" }),
      behavior(hasScreenShares, { y: true, n: false }),
    );
    schedule(userSelection, {
      g: () => setLayout("grid"),
      s: () => setLayout("spotlight"),
    });
    expectObservable(layout$).toBe(expectedLayout, {
      g: "grid",
      s: "spotlight",
    });
  });
}

describe("default mode", () => {
  test("uses grid layout in normal window", () =>
    testLayoutSwitch({
      windowMode: "    n",
      expectedLayout: "g",
    }));

  test("uses grid layout in flat window", () =>
    testLayoutSwitch({
      windowMode: "    f",
      expectedLayout: "g",
    }));
});

test("allows switching modes manually", () =>
  testLayoutSwitch({
    userSelection: " --sgs",
    expectedLayout: "g-sgs",
  }));

test("switches to spotlight mode when there is a remote screen share", () =>
  testLayoutSwitch({
    hasScreenShares: "n--y",
    expectedLayout: " g--s",
  }));

test("can manually switch to grid when there is a screenshare", () =>
  testLayoutSwitch({
    hasScreenShares: "n-y",
    userSelection: "  ---g",
    expectedLayout: " g-sg",
  }));

test("auto-switches after manually selecting grid", () =>
  testLayoutSwitch({
    // Two screenshares will happen in sequence. There is a screen share that
    // forces spotlight, then the user manually switches back to grid.
    hasScreenShares: "n-y-ny",
    userSelection: "  ---g",
    expectedLayout: " g-sg-s",
    // If we did want to respect manual selection, the expectation would be: g-sg
  }));

test("switches back to grid mode when the remote screen share ends", () =>
  testLayoutSwitch({
    hasScreenShares: "n--y--n",
    expectedLayout: " g--s--g",
  }));

test("auto-switches to spotlight again after first screen share ends", () =>
  testLayoutSwitch({
    hasScreenShares: "nyny",
    expectedLayout: " gsgs",
  }));

test("switches manually to grid after screen share while manually in spotlight", () =>
  testLayoutSwitch({
    // Initially, no one is sharing. Then the user manually switches to spotlight.
    // After a screen share starts, the user manually switches to grid.
    hasScreenShares: "n-y",
    userSelection: "  -s-g",
    expectedLayout: " gs-g",
  }));

test("allows switching modes manually when in flat window mode", () =>
  testLayoutSwitch({
    // Window becomes flat, then user switches to spotlight and back.
    // Finally the window returns to a normal shape.
    windowMode: "    nf--n",
    userSelection: " --sg",
    expectedLayout: "g-sg",
  }));

test("switches to grid when in flat window mode even when there are screen shares", () =>
  testLayoutSwitch({
    windowMode: "     nf",
    hasScreenShares: "y",
    expectedLayout: " sg",
  }));

test("ignores screen share until window mode returns to normal", () =>
  testLayoutSwitch({
    windowMode: "     f-n",
    hasScreenShares: "ny-n",
    expectedLayout: " g-sg",
  }));
