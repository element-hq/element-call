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
import { shippedBackgrounds } from "../livekit/backgroundEffects";
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

/** One letter per state: idle, waiting for a frame, attached. */
function letter(state: ProcessorState): string {
  if (state.processor === undefined) return "i";
  return state.settling ? "w" : "a";
}

describe("the pipeline's state", () => {
  function testState({
    effect,
    firstFrame = "",
    expected,
  }: {
    effect: string;
    firstFrame?: string;
    expected: string;
  }): void {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      const transformer = {
        onFirstFrame: undefined as (() => void) | undefined,
      };
      const effects = new BackgroundEffects(testScope(), {
        supported: true,
        effect$: behavior(effect, { n: "none", b: "blur" }),
        pipeline: fakePipeline().pipeline,
        transformer,
      });
      schedule(firstFrame, { f: () => transformer.onFirstFrame?.() });
      expectObservable(
        effects.state$.pipe(map(letter), distinctUntilChanged()),
      ).toBe(expected);
    });
  }

  it("defaults to no effect", () => testState({ effect: "n", expected: "i" }));

  it("waits from the first effect until a frame carries it", () =>
    testState({
      effect: "    nb-n-b",
      firstFrame: "  --f",
      expected: "  iwa",
    }));

  it("attaches on first use and stays attached", () =>
    testState({ effect: "nb-n", firstFrame: "--f", expected: "iwa" }));
});

describe("background effects", () => {
  let effect$: BehaviorSubject<string>;
  let fake: ReturnType<typeof fakePipeline>;

  function build(
    options: Partial<BackgroundEffectsOptions> = {},
  ): BackgroundEffects {
    return new BackgroundEffects(testScope(), {
      supported: true,
      effect$,
      pipeline: fake.pipeline,
      transformer: { onFirstFrame: undefined },
      ...options,
    });
  }
  const choose = async (raw: string): Promise<void> => {
    effect$.next(raw);
    await flushPromises();
  };
  const blur = async (on: boolean): Promise<void> =>
    choose(on ? "blur" : "none");

  beforeEach(() => {
    effect$ = new BehaviorSubject("none");
    fake = fakePipeline();
  });

  it("puts a shipped background on as that picture", async () => {
    build();
    await choose(`image:${shippedBackgrounds[0].id}`);
    expect(fake.switches).toEqual([
      {
        mode: "virtual-background",
        imagePath: shippedBackgrounds[0].imagePath,
      },
    ]);
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
