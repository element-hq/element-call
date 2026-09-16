/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { observeElementSize$ } from "./elementSize";

/**
 * A ResizeObserver whose notifications the test triggers itself, and which
 * keeps track of what it is watching. jsdom does not ship one.
 */
class MockResizeObserver {
  public static instances: MockResizeObserver[] = [];
  public observed: Element[] = [];
  public disconnected = false;

  public constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  public observe(element: Element): void {
    this.observed.push(element);
    // Real observers report the initial size once observation starts
    this.fire();
  }

  public unobserve(): void {}

  public disconnect(): void {
    this.disconnected = true;
  }

  public fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe("observeElementSize$", () => {
  const originalResizeObserver = window.ResizeObserver;
  let element: HTMLDivElement;
  let size: { width: number; height: number };

  beforeEach(() => {
    MockResizeObserver.instances = [];
    window.ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
    // jsdom does no layout, so the element reports whatever we say it does
    size = { width: 800, height: 600 };
    element = document.createElement("div");
    Object.defineProperty(element, "clientWidth", { get: () => size.width });
    Object.defineProperty(element, "clientHeight", { get: () => size.height });
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  it("emits the current size synchronously on subscription", () => {
    const next = vi.fn();
    observeElementSize$(element).subscribe(next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith({ width: 800, height: 600 });
    expect(MockResizeObserver.instances[0].observed).toEqual([element]);
  });

  it("emits again whenever the element is resized", () => {
    const next = vi.fn();
    observeElementSize$(element).subscribe(next);
    const [observer] = MockResizeObserver.instances;

    size = { width: 300, height: 300 };
    observer.fire();
    size = { width: 1000, height: 700 };
    observer.fire();

    expect(next.mock.calls.map(([s]) => s)).toEqual([
      { width: 800, height: 600 },
      { width: 300, height: 300 },
      { width: 1000, height: 700 },
    ]);
  });

  it("does not repeat a size that has not changed", () => {
    const next = vi.fn();
    observeElementSize$(element).subscribe(next);
    // The initial report the observer makes on observe() carried the same size
    // as the synchronous measurement, and so did not count
    expect(next).toHaveBeenCalledTimes(1);
    MockResizeObserver.instances[0].fire();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("stops observing when unsubscribed", () => {
    const subscription = observeElementSize$(element).subscribe();
    const [observer] = MockResizeObserver.instances;
    expect(observer.disconnected).toBe(false);
    subscription.unsubscribe();
    expect(observer.disconnected).toBe(true);
  });
});
