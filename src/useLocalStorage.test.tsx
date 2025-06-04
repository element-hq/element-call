/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test } from "vitest";
import { render, screen } from "@testing-library/react";
import { type FC, useEffect, useState } from "react";
import userEvent from "@testing-library/user-event";

import {
  setLocalStorageItemReactive,
  useLocalStorage,
} from "./useLocalStorage";

test("useLocalStorage reacts to changes made by an effect mounted on the same render", () => {
  localStorage.clear();
  const Test: FC = () => {
    useEffect(() => setLocalStorageItemReactive("my-value", "Hello!"), []);
    const [myValue] = useLocalStorage("my-value");
    return myValue;
  };
  render(<Test />);
  screen.getByText("Hello!");
});

test("useLocalStorage reacts to key changes", async () => {
  localStorage.clear();
  localStorage.setItem("value-1", "1");
  localStorage.setItem("value-2", "2");

  const Test: FC = () => {
    const [key, setKey] = useState("value-1");
    const [value] = useLocalStorage(key);
    if (key !== `value-${value}`) throw new Error("Value is out of sync");
    return (
      <>
        <button onClick={() => setKey("value-2")}>Switch keys</button>
        <div>Value is: {value}</div>
      </>
    );
  };
  const user = userEvent.setup();
  render(<Test />);

  screen.getByText("Value is: 1");
  await user.click(screen.getByRole("button", { name: "Switch keys" }));
  screen.getByText("Value is: 2");
});
