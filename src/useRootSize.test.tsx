/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { createElement, type FC, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useRootSizeMatches } from "./useRootSize";
import { RootElementProvider } from "./RootElementContext";

/** A ResizeObserver the test fires itself. jsdom does not ship one. */
class MockResizeObserver {
  public static instances: MockResizeObserver[] = [];

  public constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  public observe(): void {
    this.fire();
  }

  public unobserve(): void {}

  public disconnect(): void {}

  public fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe("useRootSizeMatches", () => {
  const originalResizeObserver = window.ResizeObserver;
  let root: HTMLDivElement;
  let size: { width: number; height: number };
  let Wrapper: FC<PropsWithChildren>;

  beforeEach(() => {
    MockResizeObserver.instances = [];
    window.ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
    size = { width: 800, height: 600 };
    root = document.createElement("div");
    Object.defineProperty(root, "clientWidth", { get: () => size.width });
    Object.defineProperty(root, "clientHeight", { get: () => size.height });
    Wrapper = ({ children }) =>
      createElement(RootElementProvider, { value: root }, children);
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  const resize = (to: { width: number; height: number }): void => {
    size = to;
    act(() => {
      for (const observer of MockResizeObserver.instances) observer.fire();
    });
  };

  test("answers for the root's current size straight away", () => {
    const { result } = renderHook(
      () => useRootSizeMatches(({ width }) => width <= 550),
      { wrapper: Wrapper },
    );
    expect(result.current).toBe(false);
  });

  test("follows the root as it is resized", () => {
    const { result } = renderHook(
      () => useRootSizeMatches(({ width }) => width <= 550),
      { wrapper: Wrapper },
    );

    resize({ width: 300, height: 600 });
    expect(result.current).toBe(true);

    resize({ width: 900, height: 600 });
    expect(result.current).toBe(false);
  });

  test("only re-renders when the answer changes", () => {
    const renders = vi.fn();
    renderHook(
      () => {
        renders();
        return useRootSizeMatches(({ height }) => height <= 500);
      },
      { wrapper: Wrapper },
    );
    const before = renders.mock.calls.length;

    // Still tall enough either way
    resize({ width: 800, height: 700 });
    resize({ width: 500, height: 650 });
    expect(renders.mock.calls.length).toBe(before);

    resize({ width: 500, height: 400 });
    expect(renders.mock.calls.length).toBe(before + 1);
  });

  test("keeps one subscription across renders with an inline predicate", () => {
    const { rerender } = renderHook(
      () => useRootSizeMatches(({ width }) => width <= 550),
      { wrapper: Wrapper },
    );
    rerender();
    rerender();
    expect(MockResizeObserver.instances).toHaveLength(1);
  });
});
