/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import userEvent from "@testing-library/user-event";

import { StarRatingInput } from "./StarRatingInput";

test("StarRatingInput is accessible", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { container } = render(
    <StarRatingInput starCount={5} onChange={onChange} />,
  );
  expect(await axe(container)).toHaveNoViolations();
  // Change the rating to 4 stars
  await user.click(
    (
      await screen.findAllByRole("radio", { name: "star_rating_input_label" })
    )[3],
  );
  expect(onChange).toBeCalledWith(4);
});
