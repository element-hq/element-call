/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject, distinctUntilChanged, map, of } from "rxjs";
import { type BackgroundProcessorWrapper } from "@livekit/track-processors";

import {
  BackgroundEffects,
  type BackgroundEffectsOptions,
} from "./BackgroundEffects";
import { type ProcessorState } from "../livekit/TrackProcessorContext";
import { type AddedBackground } from "../livekit/backgroundImages";
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

/** One letter per state: idle, preparing, waiting for a frame, attached. */
function letter(state: ProcessorState): string {
  if (state.supported === false) return "x";
  if (state.preparing) return "p";
  if (state.processor === undefined) return "i";
  return state.settling ? "w" : "a";
}

describe("the pipeline's state", () => {
  function testState({
    effect,
    answer = "-y",
    firstFrame = "",
    expected,
  }: {
    effect: string;
    /** When the trial build answers, from being asked. */
    answer?: string;
    firstFrame?: string;
    expected: string;
  }): void {
    withTestScheduler(({ behavior, cold, schedule, expectObservable }) => {
      const transformer = {
        onFirstFrame: undefined as (() => void) | undefined,
      };
      const effects = new BackgroundEffects(testScope(), {
        supported: true,
        effect$: behavior(effect, { n: "none", b: "blur" }),
        setEffect: vi.fn(),
        added$: new BehaviorSubject<AddedBackground[] | undefined>([]),
        canSegment: () => cold(answer, { y: true, n: false }),
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

  it("attaches only once it is known the pipeline builds", () =>
    testState({ effect: "nb", answer: "--y", expected: "ip-w" }));

  it("offers none where the pipeline fails to build", () =>
    testState({ effect: "nb", answer: "-n", expected: "ipx" }));

  it("waits from the first effect until a frame carries it", () =>
    testState({
      effect: "    nb---n-b",
      firstFrame: "---f",
      expected: "  ipwa",
    }));

  it("attaches on first use and stays attached", () =>
    testState({ effect: "nb--n", firstFrame: "---f", expected: "ipwa" }));
});

describe("background effects", () => {
  let effect$: BehaviorSubject<string>;
  let added$: BehaviorSubject<AddedBackground[] | undefined>;
  let setEffect: (raw: string) => void;
  let fake: ReturnType<typeof fakePipeline>;

  function build(
    options: Partial<BackgroundEffectsOptions> = {},
  ): BackgroundEffects {
    return new BackgroundEffects(testScope(), {
      supported: true,
      effect$,
      setEffect,
      added$,
      canSegment: () => of(true),
      pipeline: fake.pipeline,
      transformer: { onFirstFrame: undefined },
      ...options,
    });
  }
  const choose = async (raw: string): Promise<void> => {
    effect$.next(raw);
    await flushPromises();
  };

  beforeEach(() => {
    effect$ = new BehaviorSubject("none");
    added$ = new BehaviorSubject<AddedBackground[] | undefined>(undefined);
    setEffect = vi.fn((raw: string) => effect$.next(raw));
    fake = fakePipeline();
  });

  it("offers none for the session where the pipeline fails to build", async () => {
    const effects = build({ canSegment: () => of(false) });
    await choose("blur");

    expect(effects.state$.value.supported).toBe(false);
    expect(effects.state$.value.processor).toBeUndefined();
    expect(effects.state$.value.settling).toBe(false);
    // A browser update may fix it, so the next session asks again.
    expect(effect$.value).toBe("blur");
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
    await choose("blur");
    const pipeline = effects.state$.value.processor;
    await choose("none");
    await choose("blur");

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
    await choose("blur");
    await choose("none");
    await choose("blur");
    await choose("none");
    expect(fake.switches).toHaveLength(1);

    finished();
    await flushPromises();
    expect(fake.switches).toEqual([
      { mode: "background-blur", blurRadius: 15 },
      { mode: "disabled" },
    ]);
  });

  it("clears a remembered effect when it cannot be honoured", () => {
    effect$.next(`image:${shippedBackgrounds[0].id}`);
    const effects = build({ supported: false });
    expect(effect$.value).toBe("none");
    expect(effects.state$.value.processor).toBeUndefined();
  });

  it("puts an added background on as its picture", async () => {
    added$.next([{ id: "mine", url: "blob:mine" }]);
    build();
    await choose("added:mine");
    expect(fake.switches).toEqual([
      { mode: "virtual-background", imagePath: "blob:mine" },
    ]);
  });

  it("switches between any two effects in place", async () => {
    added$.next([{ id: "mine", url: "blob:mine" }]);
    const shipped = shippedBackgrounds[0];
    const options: Record<string, unknown> = {
      none: { mode: "disabled" },
      blur: { mode: "background-blur", blurRadius: 15 },
      [`image:${shipped.id}`]: {
        mode: "virtual-background",
        imagePath: shipped.imagePath,
      },
      "added:mine": { mode: "virtual-background", imagePath: "blob:mine" },
    };
    // Each kind to each other kind, and back.
    const order = [
      "blur",
      `image:${shipped.id}`,
      "added:mine",
      "blur",
      "added:mine",
      `image:${shipped.id}`,
      "none",
      "added:mine",
      "none",
      "blur",
    ];
    const effects = build();
    await choose(order[0]);
    const pipeline = effects.state$.value.processor;
    for (const raw of order.slice(1)) await choose(raw);

    expect(effects.state$.value.processor).toBe(pipeline);
    expect(fake.switches).toEqual(order.map((raw) => options[raw]));
  });

  it("forgets an added background the device no longer keeps", () => {
    effect$.next("added:gone");
    build();
    // Not before the device has said what it keeps.
    expect(effect$.value).toBe("added:gone");
    added$.next([]);
    expect(effect$.value).toBe("none");
  });
});
