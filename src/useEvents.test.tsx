/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test } from "vitest";
import { render, screen } from "@testing-library/react";
import { type FC, useEffect, useState } from "react";
import userEvent from "@testing-library/user-event";
import { TypedEventEmitter } from "matrix-js-sdk";

import { useTypedEventEmitterState } from "./useEvents";

class TestEmitter extends TypedEventEmitter<"change", { change: () => void }> {
  private state = 1;
  public readonly getState = (): number => this.state;
  public readonly getNegativeState = (): number => -this.state;
  public readonly setState = (value: number): void => {
    this.state = value;
    this.emit("change");
  };
}

test("useTypedEventEmitterState reacts to events", async () => {
  const user = userEvent.setup();
  const emitter = new TestEmitter();

  const Test: FC = () => {
    const value = useTypedEventEmitterState(
      emitter,
      "change",
      emitter.getState,
    );
    return (
      <>
        <button onClick={() => emitter.setState(2)}>Change value</button>
        <div>Value is {value}</div>
      </>
    );
  };

  render(<Test />);
  screen.getByText("Value is 1");
  await user.click(screen.getByText("Change value"));
  screen.getByText("Value is 2");
});

test("useTypedEventEmitterState reacts to changes made by an effect mounted on the same render", () => {
  const emitter = new TestEmitter();

  const Test: FC = () => {
    useEffect(() => emitter.setState(2), []);
    const value = useTypedEventEmitterState(
      emitter,
      "change",
      emitter.getState,
    );
    return `Value is ${value}`;
  };

  render(<Test />);
  screen.getByText("Value is 2");
});

test("useTypedEventEmitterState reacts to changes in getState", async () => {
  const user = userEvent.setup();
  const emitter = new TestEmitter();

  const Test: FC = () => {
    const [fn, setFn] = useState(() => emitter.getState);
    const value = useTypedEventEmitterState(emitter, "change", fn);
    return (
      <>
        <button onClick={() => setFn(() => emitter.getNegativeState)}>
          Change getState
        </button>
        <div>Value is {value}</div>
      </>
    );
  };

  render(<Test />);
  screen.getByText("Value is 1");
  await user.click(screen.getByText("Change getState"));
  screen.getByText("Value is -1");
});
