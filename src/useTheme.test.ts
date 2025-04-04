/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  test,
  vi,
} from "vitest";
import EventEmitter from "events";
import { WidgetApiToWidgetAction } from "matrix-widget-api";

import { useTheme } from "./useTheme";
import { getUrlParams } from "./UrlParams";
import { widget } from "./widget";

vi.mock("./UrlParams", () => ({ getUrlParams: vi.fn() }));
vi.mock("./widget", () => ({
  widget: {
    api: { transport: { reply: vi.fn() } },
    lazyActions: new EventEmitter(),
  },
}));

describe("useTheme", () => {
  let originalClassList: DOMTokenList;
  beforeEach(() => {
    // Save the original classList to setup spies
    originalClassList = document.body.classList;

    vi.spyOn(originalClassList, "add");
    vi.spyOn(originalClassList, "remove");
    vi.spyOn(originalClassList, "item").mockReturnValue(null);
    (getUrlParams as Mock).mockReturnValue({ theme: "dark" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    { setTheme: null, add: ["cpd-theme-dark"] },
    { setTheme: "light", add: ["cpd-theme-light"] },
    { setTheme: "dark-high-contrast", add: ["cpd-theme-dark-hc"] },
    { setTheme: "light-high-contrast", add: ["cpd-theme-light-hc"] },
  ])("apply procedure", ({ setTheme, add }) => {
    test(`should apply ${add[0]} theme when ${setTheme} theme is specified`, () => {
      (getUrlParams as Mock).mockReturnValue({ theme: setTheme });

      renderHook(() => useTheme());

      expect(originalClassList.remove).toHaveBeenCalledWith(
        "cpd-theme-light",
        "cpd-theme-dark",
        "cpd-theme-light-hc",
        "cpd-theme-dark-hc",
      );
      expect(originalClassList.add).toHaveBeenCalledWith(...add);
    });
  });

  test("should not reapply the same theme if it hasn't changed", () => {
    // Simulate a previous theme
    originalClassList.item = vi.fn().mockReturnValue("cpd-theme-dark");

    renderHook(() => useTheme());

    expect(document.body.classList.add).not.toHaveBeenCalledWith(
      "cpd-theme-dark",
    );

    // Ensure the 'no-theme' class is removed
    expect(document.body.classList.remove).toHaveBeenCalledWith("no-theme");
    expect(originalClassList.add).not.toHaveBeenCalled();
  });

  test("theme changes in response to widget actions", async () => {
    renderHook(() => useTheme());

    expect(originalClassList.add).toHaveBeenCalledWith("cpd-theme-dark");
    await act(() =>
      widget!.lazyActions.emit(
        WidgetApiToWidgetAction.ThemeChange,
        new CustomEvent(WidgetApiToWidgetAction.ThemeChange, {
          detail: { data: { name: "light" } },
        }),
      ),
    );
    expect(originalClassList.remove).toHaveBeenCalledWith(
      "cpd-theme-light",
      "cpd-theme-dark",
      "cpd-theme-light-hc",
      "cpd-theme-dark-hc",
    );
    expect(originalClassList.add).toHaveBeenLastCalledWith("cpd-theme-light");
  });
});
