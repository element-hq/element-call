/*
Copyright 2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
