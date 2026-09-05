/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useUrlParams } from "./UrlParams";
import { useRootElement } from "./RootElementContext";
import { useHostBridge } from "./HostBridge";

export const useTheme = (): void => {
  const rootElement = useRootElement();
  const hostBridge = useHostBridge();
  const { theme } = useUrlParams();
  const [requestedTheme, setRequestedTheme] = useState(theme);
  const previousTheme = useRef<string | null>(rootElement.classList.item(0));

  useEffect(() => {
    const subscription = hostBridge.themeChange$.subscribe(
      ({ data, reply }) => {
        if (typeof data.name === "string") setRequestedTheme(data.name);
        reply();
      },
    );
    return (): void => subscription.unsubscribe();
  }, [hostBridge]);

  useLayoutEffect(() => {
    // If no theme has been explicitly requested we default to dark
    const theme = requestedTheme?.includes("light") ? "light" : "dark";
    const themeHighContrast = requestedTheme?.includes("high-contrast")
      ? "-hc"
      : "";
    const themeString = "cpd-theme-" + theme + themeHighContrast;
    if (themeString !== previousTheme.current) {
      rootElement.classList.remove(
        "cpd-theme-light",
        "cpd-theme-dark",
        "cpd-theme-light-hc",
        "cpd-theme-dark-hc",
      );
      rootElement.classList.add(themeString);
      previousTheme.current = themeString;
    }
    rootElement.classList.remove("no-theme");
  }, [previousTheme, requestedTheme, rootElement]);
};
