/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, renderHook } from "@testing-library/react";
import { createElement, type FC, type PropsWithChildren } from "react";
import { Subject } from "rxjs";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  test,
  vi,
} from "vitest";

import { useTheme } from "./useTheme";
import { useUrlParams } from "./UrlParams";
import {
  type HostBridge,
  HostBridgeProvider,
  type HostRequest,
  nullHostBridge,
} from "./HostBridge";

vi.mock("./UrlParams", () => ({ useUrlParams: vi.fn() }));

describe("useTheme", () => {
  let originalClassList: DOMTokenList;
  let themeChange$: Subject<HostRequest<{ name?: string }>>;
  let wrapper: FC<PropsWithChildren>;

  beforeEach(() => {
    themeChange$ = new Subject();
    const hostBridge: HostBridge = { ...nullHostBridge, themeChange$ };
    wrapper = ({ children }) =>
      createElement(HostBridgeProvider, { value: hostBridge }, children);
    // Save the original classList to setup spies
    originalClassList = document.body.classList;

    vi.spyOn(originalClassList, "add");
    vi.spyOn(originalClassList, "remove");
    vi.spyOn(originalClassList, "item").mockReturnValue(null);
    (useUrlParams as Mock).mockReturnValue({ theme: "dark" });
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

      renderHook(() => useTheme(), { wrapper });

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

    renderHook(() => useTheme(), { wrapper });

    expect(document.body.classList.add).not.toHaveBeenCalledWith(
      "cpd-theme-dark",
    );

    // Ensure the 'no-theme' class is removed
    expect(document.body.classList.remove).toHaveBeenCalledWith("no-theme");
    expect(originalClassList.add).not.toHaveBeenCalled();
  });

  test("theme changes in response to host requests", () => {
    renderHook(() => useTheme(), { wrapper });

    expect(originalClassList.add).toHaveBeenCalledWith("cpd-theme-dark");
    const reply = vi.fn();
    act(() => themeChange$.next({ data: { name: "light" }, reply }));
    expect(reply).toHaveBeenCalledOnce();
    expect(originalClassList.remove).toHaveBeenCalledWith(
      "cpd-theme-light",
      "cpd-theme-dark",
      "cpd-theme-light-hc",
      "cpd-theme-dark-hc",
    );
    expect(originalClassList.add).toHaveBeenLastCalledWith("cpd-theme-light");
  });
});
