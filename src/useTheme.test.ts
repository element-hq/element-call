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
    // Save the original classList so we can restore it later
    originalClassList = document.body.classList;

    vi.spyOn(document.body.classList, "add").mockImplementation(vi.fn());
    vi.spyOn(document.body.classList, "remove").mockImplementation(vi.fn());
    vi.spyOn(document.body.classList, "item").mockImplementation(() => null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("should apply dark theme by default when no theme is specified", () => {
    // Mock useUrlParams to return no theme
    (useUrlParams as Mock).mockReturnValue({ theme: null });

    renderHook(() => useTheme());

    expect(originalClassList.remove).toHaveBeenCalledWith(
      "cpd-theme-light",
      "cpd-theme-dark",
      "cpd-theme-light-hc",
      "cpd-theme-dark-hc",
    );
    expect(originalClassList.add).toHaveBeenCalledWith("cpd-theme-dark");
  });

  test("should apply light theme when theme is set to light", () => {
    // Mock useUrlParams to return light theme
    (useUrlParams as Mock).mockReturnValue({ theme: "light" });

    renderHook(() => useTheme());

    expect(originalClassList.remove).toHaveBeenCalledWith(
      "cpd-theme-light",
      "cpd-theme-dark",
      "cpd-theme-light-hc",
      "cpd-theme-dark-hc",
    );
    expect(originalClassList.add).toHaveBeenCalledWith("cpd-theme-light");
  });

  test("should apply dark-high-contrast theme when theme is set to dark-high-contrast", () => {
    // Mock useUrlParams to return dark-high-contrast theme
    (useUrlParams as Mock).mockReturnValue({
      theme: "dark-high-contrast",
    });

    renderHook(() => useTheme());

    expect(originalClassList.remove).toHaveBeenCalledWith(
      "cpd-theme-light",
      "cpd-theme-dark",
      "cpd-theme-light-hc",
      "cpd-theme-dark-hc",
    );
    expect(originalClassList.add).toHaveBeenCalledWith("cpd-theme-dark-hc");
  });

  test("should apply light-high-contrast theme when theme is set to light-high-contrast", () => {
    // Mock useUrlParams to return light-high-contrast theme
    (useUrlParams as Mock).mockReturnValue({
      theme: "light-high-contrast",
    });

    renderHook(() => useTheme());

    expect(originalClassList.remove).toHaveBeenCalledWith(
      "cpd-theme-light",
      "cpd-theme-dark",
      "cpd-theme-light-hc",
      "cpd-theme-dark-hc",
    );
    expect(originalClassList.add).toHaveBeenCalledWith("cpd-theme-light-hc");
  });

  test("should not reapply the same theme if it hasn't changed", () => {
    // Mock useUrlParams to return dark theme initially
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
