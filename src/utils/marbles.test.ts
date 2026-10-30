/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Observable, Subject, timer } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withTestScheduler } from "./test";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTestScheduler", () => {
  it("times cold Observables from each subscription", () => {
    withTestScheduler(({ cold, expectObservable, schedule }) => {
      const source$ = cold("-a-b|");
      expectObservable(source$).toBe("-a-b|");
      const late: string[] = [];
      schedule("--s", {
        s: () => {
          source$.subscribe((v) => late.push(v));
        },
      });
      schedule("------e", {
        e: () => {
          expect(late).toEqual(["a", "b"]);
        },
      });
    });
  });

  it("times hot Observables from the start of the run", () => {
    withTestScheduler(({ hot, expectObservable, schedule }) => {
      const source$ = hot("a-b-c");
      // Frame 0 of a hot Observable is delivered once the run starts, after
      // expectations registered during the continuation have subscribed
      expectObservable(source$).toBe("a-b-c");
      const late: string[] = [];
      schedule("---s", {
        s: () => {
          source$.subscribe((v) => late.push(v));
        },
      });
      schedule("-----e", {
        e: () => {
          expect(late).toEqual(["c"]);
        },
      });
    });
  });

  it("honours subscription marbles", () => {
    withTestScheduler(({ cold, expectObservable }) => {
      expectObservable(cold("-a-b-c"), "^---!").toBe("-a-b");
    });
  });

  it("records completion and errors", () => {
    withTestScheduler(({ cold, expectObservable }) => {
      expectObservable(cold("a|")).toBe("a|");
      const boom = new Error("boom");
      expectObservable(cold("-#", {}, boom)).toBe("-#", {}, boom);
    });
  });

  it("subscribes expectations before actions scheduled on frame 0 run", () => {
    withTestScheduler(({ schedule, expectObservable, behavior }) => {
      const subject = new Subject<number>();
      schedule("a-b", { a: () => subject.next(1), b: () => subject.next(2) });
      expectObservable(subject).toBe("a-b", { a: 1, b: 2 });

      const value$ = behavior("x-y", { x: 1, y: 2 });
      expect(value$.value).toBe(1);
      expectObservable(value$).toBe("x-y", { x: 1, y: 2 });
    });
  });

  it("runs rxjs timers however long they are", () => {
    withTestScheduler(({ expectObservable }) => {
      expectObservable(timer(90_000)).toBe("90s (a|)", { a: 0 });
    });
  });

  it("runs plain timers and Date on the same clock as the marbles", () => {
    withTestScheduler(({ expectObservable, schedule }) => {
      const start = Date.now();
      const source$ = new Observable<string>((subscriber) => {
        setTimeout(() => {
          subscriber.next("a");
          subscriber.complete();
        }, 500);
      });
      expectObservable(source$).toBe("500ms (a|)");
      schedule("--d", {
        d: () => {
          expect(Date.now() - start).toBe(2);
        },
      });
    });
  });

  it("runs plain timers due on a frame before the rxjs actions due on it", () => {
    withTestScheduler(({ schedule }) => {
      const order: string[] = [];
      setTimeout(() => order.push("plain"), 5);
      schedule("-----r-e", {
        r: () => {
          order.push("rxjs");
        },
        e: () => {
          expect(order).toEqual(["plain", "rxjs"]);
        },
      });
    });
  });

  it("schedules an rxjs timer started from a plain timer at the right frame", () => {
    withTestScheduler(({ expectObservable, hot }) => {
      // Something rxjs is due later, so the clock must not run straight to it
      expectObservable(hot("300ms z")).toBe("300ms z");
      const subject = new Subject<number>();
      setTimeout(() => timer(50).subscribe(subject), 100);
      expectObservable(subject).toBe("150ms (a|)", { a: 0 });
    });
  });

  it("does not run the clock on to an action that a plain timer took back", () => {
    withTestScheduler(({ flush }) => {
      const start = Date.now();
      const subscription = timer(10).subscribe();
      setTimeout(() => subscription.unsubscribe(), 5);
      flush();
      expect(Date.now() - start).toBe(5);
    });
  });

  it("flushes part-way, and keeps counting frames from the start", () => {
    withTestScheduler(({ hot, expectObservable, flush }) => {
      const source$ = hot("-a-b");
      const seen: string[] = [];
      source$.subscribe((v) => seen.push(v));
      flush();
      expect(seen).toEqual(["a", "b"]);
      expectObservable(hot("-c")).toBe("----c");
    });
  });

  it("fails on a mismatch and restores real timers", () => {
    expect(() =>
      withTestScheduler(({ cold, expectObservable }) => {
        expectObservable(cold("a")).toBe("b");
      }),
    ).toThrow();
    expect(vi.isFakeTimers()).toBe(false);
  });

  it("keeps a date that was set without fake timers", () => {
    vi.setSystemTime(1000);
    withTestScheduler(({ schedule }) => {
      schedule("--a", {
        a: () => {
          expect(Date.now()).toBe(1002);
        },
      });
    });
    expect(vi.isFakeTimers()).toBe(false);
    expect(Date.now()).toBe(1000);
  });

  it("refuses a caller's fake timers that leave Date real", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    expect(() => withTestScheduler(() => {})).toThrow(
      "withTestScheduler needs Date faked along with the timers",
    );
  });
});
