/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WidgetApiToWidgetAction } from "matrix-widget-api";
import { type IThemeChangeActionRequest } from "matrix-widget-api";

import { getUrlParams } from "./UrlParams";
import { widget } from "./widget";

export const useTheme = (): void => {
  const [requestedTheme, setRequestedTheme] = useState(
    () => getUrlParams().theme,
  );
  const previousTheme = useRef<string | null>(document.body.classList.item(0));

  useEffect(() => {
    if (widget) {
      const onThemeChange = (
        ev: CustomEvent<IThemeChangeActionRequest>,
      ): void => {
        ev.preventDefault();
        if ("name" in ev.detail.data && typeof ev.detail.data.name === "string")
          setRequestedTheme(ev.detail.data.name);
        widget!.api.transport.reply(ev.detail, {});
      };

      widget.lazyActions.on(WidgetApiToWidgetAction.ThemeChange, onThemeChange);
      return (): void => {
        widget!.lazyActions.off(
          WidgetApiToWidgetAction.ThemeChange,
          onThemeChange,
        );
      };
    }
  }, []);

  useLayoutEffect(() => {
    // If no theme has been explicitly requested we default to dark
    const theme = requestedTheme?.includes("light") ? "light" : "dark";
    const themeHighContrast = requestedTheme?.includes("high-contrast")
      ? "-hc"
      : "";
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
  }, [previousTheme, requestedTheme]);
};
