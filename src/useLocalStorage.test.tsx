/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test } from "vitest";
import { render, screen } from "@testing-library/react";
import { type FC, useEffect } from "react";

import { setLocalStorageItem, useLocalStorage } from "./useLocalStorage";

test("useLocalStorage reacts to changes made by an effect mounted on the same render", () => {
  localStorage.clear();
  const Test: FC = () => {
    useEffect(() => setLocalStorageItem("my-value", "Hello!"), []);
    const [myValue] = useLocalStorage("my-value");
    return myValue;
  };
  render(<Test />);
  screen.getByText("Hello!");
});
