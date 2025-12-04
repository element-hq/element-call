/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { firstValueFrom, of } from "rxjs";

import { createLayoutModeSwitch } from "./LayoutSwitch";
import { ObservableScope } from "../ObservableScope";
import { constant } from "../Behavior";
import { withTestScheduler } from "../../utils/test";

let scope: ObservableScope;
beforeEach(() => {
  scope = new ObservableScope();
});
afterEach(() => {
  scope.end();
});

describe("Default mode", () => {
  test("Should be in grid layout by default", async () => {
    const { gridMode$ } = createLayoutModeSwitch(
      scope,
      constant("normal"),
      of(false),
    );

    const mode = await firstValueFrom(gridMode$);
    expect(mode).toBe("grid");
  });

  test("Should switch to spotlight mode when window mode is flat", async () => {
    const { gridMode$ } = createLayoutModeSwitch(
      scope,
      constant("flat"),
      of(false),
    );

    const mode = await firstValueFrom(gridMode$);
    expect(mode).toBe("spotlight");
  });
});

test("Should allow switching modes manually", () => {
  withTestScheduler(({ cold, behavior, expectObservable, schedule }): void => {
    const { gridMode$, setGridMode } = createLayoutModeSwitch(
      scope,
      behavior("n", { n: "normal" }),
      cold("f", { f: false, t: true }),
    );

    schedule("--sgs", {
      s: () => setGridMode("spotlight"),
      g: () => setGridMode("grid"),
    });

    expectObservable(gridMode$).toBe("g-sgs", {
      g: "grid",
      s: "spotlight",
    });
  });
});

test("Should switch to spotlight mode when there is a remote screen share", () => {
  withTestScheduler(({ cold, behavior, expectObservable }): void => {
    const shareMarble = "f--t";
    const gridsMarble = "g--s";
    const { gridMode$ } = createLayoutModeSwitch(
      scope,
      behavior("n", { n: "normal" }),
      cold(shareMarble, { f: false, t: true }),
    );

    expectObservable(gridMode$).toBe(gridsMarble, {
      g: "grid",
      s: "spotlight",
    });
  });
});

test("Can manually force grid when there is a screenshare", () => {
  withTestScheduler(({ cold, behavior, expectObservable, schedule }): void => {
    const { gridMode$, setGridMode } = createLayoutModeSwitch(
      scope,
      behavior("n", { n: "normal" }),
      cold("-ft", { f: false, t: true }),
    );

    schedule("---g", {
      g: () => setGridMode("grid"),
    });

    expectObservable(gridMode$).toBe("ggsg", {
      g: "grid",
      s: "spotlight",
    });
  });
});

test("Should auto-switch after manually selected grid", () => {
  withTestScheduler(({ cold, behavior, expectObservable, schedule }): void => {
    const { gridMode$, setGridMode } = createLayoutModeSwitch(
      scope,
      behavior("n", { n: "normal" }),
      // Two screenshares will happen in sequence
      cold("-ft-ft", { f: false, t: true }),
    );

    // There was a screen-share that forced spotlight, then
    // the user manually switch back to grid
    schedule("---g", {
      g: () => setGridMode("grid"),
    });

    // If we did want to respect manual selection, the expectation would be:
    // const expectation = "ggsg";
    const expectation = "ggsg-s";

    expectObservable(gridMode$).toBe(expectation, {
      g: "grid",
      s: "spotlight",
    });
  });
});

test("Should switch back to grid mode when the remote screen share ends", () => {
  withTestScheduler(({ cold, behavior, expectObservable }): void => {
    const shareMarble = "f--t--f-";
    const gridsMarble = "g--s--g-";
    const { gridMode$ } = createLayoutModeSwitch(
      scope,
      behavior("n", { n: "normal" }),
      cold(shareMarble, { f: false, t: true }),
    );

    expectObservable(gridMode$).toBe(gridsMarble, {
      g: "grid",
      s: "spotlight",
    });
  });
});

test("can auto-switch to spotlight again after first screen share ends", () => {
  withTestScheduler(({ cold, behavior, expectObservable }): void => {
    const shareMarble = "ftft";
    const gridsMarble = "gsgs";
    const { gridMode$ } = createLayoutModeSwitch(
      scope,
      behavior("n", { n: "normal" }),
      cold(shareMarble, { f: false, t: true }),
    );

    expectObservable(gridMode$).toBe(gridsMarble, {
      g: "grid",
      s: "spotlight",
    });
  });
});

test("can switch manually to grid after screen share while manually in spotlight", () => {
  withTestScheduler(({ cold, behavior, schedule, expectObservable }): void => {
    // Initially, no one is sharing. Then the user manually switches to
    // spotlight. After a screen share starts, the user manually switches to
    // grid.
    const shareMarbles = "  f-t-";
    const setModeMarbles = "-s-g";
    const expectation = "   gs-g";
    const { gridMode$, setGridMode } = createLayoutModeSwitch(
      scope,
      behavior("n", { n: "normal" }),
      cold(shareMarbles, { f: false, t: true }),
    );
    schedule(setModeMarbles, {
      g: () => setGridMode("grid"),
      s: () => setGridMode("spotlight"),
    });

    expectObservable(gridMode$).toBe(expectation, {
      g: "grid",
      s: "spotlight",
    });
  });
});

test("Should auto-switch to spotlight when in flat window mode", () => {
  withTestScheduler(({ cold, behavior, expectObservable }): void => {
    const { gridMode$ } = createLayoutModeSwitch(
      scope,
      behavior("naf", { n: "normal", a: "narrow", f: "flat" }),
      cold("f", { f: false, t: true }),
    );

    expectObservable(gridMode$).toBe("g-s-", {
      g: "grid",
      s: "spotlight",
    });
  });
});
