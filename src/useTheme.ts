/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useLayoutEffect, useRef } from "react";

import { useUrlParams } from "./UrlParams";

export const useTheme = (): void => {
  const { theme: themeName } = useUrlParams();
  const previousTheme = useRef<string | null>(document.body.classList.item(0));
  useLayoutEffect(() => {
    // If the url does not contain a theme props we default to "dark".
    const theme = themeName?.includes("light") ? "light" : "dark";
    const themeHighContrast = themeName?.includes("high-contrast") ? "-hc" : "";
    const themeString = "cpd-theme-" + theme + themeHighContrast;
    if (themeString !== previousTheme.current) {
      document.body.classList.remove(
        "cpd-theme-light",
        "cpd-theme-dark",
        "cpd-theme-light-hc",
        "cpd-theme-dark-hc",
      );
      document.body.classList.add(themeString);
      previousTheme.current = themeString;
    }
    document.body.classList.remove("no-theme");
  }, [previousTheme, themeName]);
};
