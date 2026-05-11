/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeAll } from "vitest";
import { setProjectAnnotations } from "@storybook/react-vite";
import * as projectAnnotations from "./preview";

// Apply the right Storybook configuration when testing stories.
// See: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
const annotations = setProjectAnnotations([projectAnnotations]);

// Run Storybook's beforeAll hook (sets up decorators, parameters, etc.)
beforeAll(annotations.beforeAll);
