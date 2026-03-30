/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { LayoutToggle } from "./LayoutToggle";

const meta = {
  component: LayoutToggle,
} satisfies Meta<typeof LayoutToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    layout: "grid",
    setLayout: fn(),
  },
};
