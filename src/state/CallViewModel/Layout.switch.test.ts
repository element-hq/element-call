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

test.fails("Can manually force grid when there is a screenshare", () => {
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
