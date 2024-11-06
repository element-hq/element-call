/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";
import { render, configure } from "@testing-library/react";

import { RaisedHandIndicator } from "./RaisedHandIndicator";

configure({
  defaultHidden: true,
});

describe("RaisedHandIndicator", () => {
  test("renders nothing when no hand has been raised", () => {
    const { container } = render(<RaisedHandIndicator />);
    expect(container.firstChild).toBeNull();
  });
  test("renders an indicator when a hand has been raised", () => {
    const dateTime = new Date();
    const { container } = render(
      <RaisedHandIndicator raisedHandTime={dateTime} showTimer />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
  test("renders an indicator when a hand has been raised with the expected time", () => {
    const dateTime = new Date(new Date().getTime() - 60000);
    const { container } = render(
      <RaisedHandIndicator raisedHandTime={dateTime} showTimer />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
  test("renders a smaller indicator when minature is specified", () => {
    const dateTime = new Date();
    const { container } = render(
      <RaisedHandIndicator raisedHandTime={dateTime} minature showTimer />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
  test("can be clicked", () => {
    const dateTime = new Date();
    let wasClicked = false;
    const { getByRole } = render(
      <RaisedHandIndicator
        raisedHandTime={dateTime}
        onClick={() => (wasClicked = true)}
      />,
    );
    getByRole("button").click();
    expect(wasClicked).toBe(true);
  });
});
