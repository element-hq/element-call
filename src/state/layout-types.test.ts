/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, expect } from "vitest";
import { layoutShallowEquals, type Layout } from "./layout-types";
import {
  type SpotlightTileViewModel,
  type GridTileViewModel,
} from "./TileViewModel";
import { type FloatingTile } from "./FloatingTile";

const spotlightTile = {} as unknown as SpotlightTileViewModel;
const gridTile = {} as unknown as GridTileViewModel;
const pipTile = {} as unknown as FloatingTile & { vm: GridTileViewModel };

const spotlightExpanded: Layout = {
  type: "spotlight-expanded",
  spotlight: spotlightTile,
};

const spotlightPortrait: Layout = {
  type: "spotlight-portrait",
  spotlight: { vm: spotlightTile },
  grid: [gridTile],
  setVisibleTiles: () => {},
};

test("layoutShallowEquals considers a layout to be equal to its shallow clone", () =>
  expect(layoutShallowEquals(spotlightExpanded, { ...spotlightExpanded })).toBe(
    true,
  ));

test("layoutShallowEquals detects a missing key", () => {
  expect(
    layoutShallowEquals(spotlightExpanded, {
      ...spotlightExpanded,
      pip: pipTile,
    }),
  ).toBe(false);
  expect(
    layoutShallowEquals(
      { ...spotlightExpanded, pip: pipTile },
      spotlightExpanded,
    ),
  ).toBe(false);
});

test("layoutShallowEquals considers grid arrays with equal contents to be equal", () =>
  expect(
    layoutShallowEquals(spotlightPortrait, {
      ...spotlightPortrait,
      grid: [...spotlightPortrait.grid],
    }),
  ).toBe(true));

test("layoutShallowEquals detects grid arrays with different contents", () =>
  expect(
    layoutShallowEquals(spotlightPortrait, {
      ...spotlightPortrait,
      grid: [...spotlightPortrait.grid, gridTile],
    }),
  ).toBe(false));
