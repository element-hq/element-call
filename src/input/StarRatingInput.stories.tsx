/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { StarRatingInput } from "./StarRatingInput";

const meta = {
  component: StarRatingInput,
} satisfies Meta<typeof StarRatingInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    starCount: 5,
    onChange: fn(),
  },
};
