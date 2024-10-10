/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { renderHook } from "@testing-library/react-hooks";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  Mock,
  test,
  vi,
} from "vitest";

import { useTheme } from "./useTheme";
import { useUrlParams } from "./UrlParams";

// Mock the useUrlParams hook
vi.mock("./UrlParams", () => ({
  useUrlParams: vi.fn(),
}));

describe("useTheme", () => {
  let originalClassList: DOMTokenList;
  beforeEach(() => {
    // Save the original classList to setup spies
    originalClassList = document.body.classList;

    vi.spyOn(originalClassList, "add");
    vi.spyOn(originalClassList, "remove");
    vi.spyOn(originalClassList, "item").mockReturnValue(null);
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
      (useUrlParams as Mock).mockReturnValue({ theme: setTheme });

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
    (useUrlParams as Mock).mockReturnValue({ theme: "dark" });
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
});
