/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject, distinctUntilChanged, map } from "rxjs";
import { type BackgroundProcessorWrapper } from "@livekit/track-processors";

import {
  BackgroundEffects,
  type BackgroundEffectsOptions,
} from "./BackgroundEffects";
import { type ProcessorState } from "../livekit/TrackProcessorContext";
import { flushPromises, testScope, withTestScheduler } from "../utils/test";

/** A pipeline that records what it is switched to. */
function fakePipeline(): {
  pipeline: BackgroundProcessorWrapper;
  switches: unknown[];
  /** Holds the next switch until it resolves, as a picture loading does. */
  holdNext: () => () => void;
} {
  const switches: unknown[] = [];
  let slow: Promise<void> | undefined;
  const pipeline = {
    switchTo: vi.fn(async (options: unknown) => {
      switches.push(options);
      const held = slow;
      slow = undefined;
      await held;
    }),
  } as unknown as BackgroundProcessorWrapper;
  return {
    pipeline,
    switches,
    holdNext: () => {
      let release!: () => void;
      slow = new Promise((resolve) => (release = resolve));
      return release;
    },
  };
}

/** One letter per state: idle, attached. */
function letter(state: ProcessorState): string {
  return state.processor === undefined ? "i" : "a";
}

describe("the pipeline's state", () => {
  function testState({
    effect,
    expected,
  }: {
    effect: string;
    expected: string;
  }): void {
    withTestScheduler(({ behavior, expectObservable }) => {
      const effects = new BackgroundEffects(testScope(), {
        supported: true,
        blur$: behavior(effect, { n: false, b: true }),
        pipeline: fakePipeline().pipeline,
      });
      expectObservable(
        effects.state$.pipe(map(letter), distinctUntilChanged()),
      ).toBe(expected);
    });
  }

  it("attaches on first use and stays attached", () =>
    testState({ effect: "nbn", expected: "ia" }));
});

describe("background effects", () => {
  let blur$: BehaviorSubject<boolean>;
  let fake: ReturnType<typeof fakePipeline>;

  function build(
    options: Partial<BackgroundEffectsOptions> = {},
  ): BackgroundEffects {
    return new BackgroundEffects(testScope(), {
      supported: true,
      blur$,
      pipeline: fake.pipeline,
      ...options,
    });
  }
  const blur = async (on: boolean): Promise<void> => {
    blur$.next(on);
    await flushPromises();
  };

  beforeEach(() => {
    blur$ = new BehaviorSubject(false);
    fake = fakePipeline();
  });

  it("switches in place rather than reattaching", async () => {
    const effects = build();
    await blur(true);
    const pipeline = effects.state$.value.processor;
    await blur(false);
    await blur(true);

    expect(effects.state$.value.processor).toBe(pipeline);
    expect(fake.switches).toEqual([
      { mode: "background-blur", blurRadius: 15 },
      { mode: "disabled" },
      { mode: "background-blur", blurRadius: 15 },
    ]);
  });

  it("switches one at a time, skipping those overtaken", async () => {
    const finished = fake.holdNext();
    build();
    await blur(true);
    await blur(false);
    await blur(true);
    await blur(false);
    expect(fake.switches).toHaveLength(1);

    finished();
    await flushPromises();
    expect(fake.switches).toEqual([
      { mode: "background-blur", blurRadius: 15 },
      { mode: "disabled" },
    ]);
  });
});
