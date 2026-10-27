/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { type CallLayout } from "./CallLayout";
import { makeGridLayout } from "./GridLayout";
import { makeSpotlightLandscapeLayout } from "./SpotlightLandscapeLayout";
import { makeSpotlightPortraitLayout } from "./SpotlightPortraitLayout";
import { type LayoutProps } from "./Grid";
import { constant } from "../state/Behavior";
import { type Alignment } from "../state/layout-types";
import { type UserMediaViewModel } from "../state/media/UserMediaViewModel";
import {
  GridTileViewModel,
  SpotlightTileViewModel,
  type TileViewModel,
} from "../state/TileViewModel";
import { makeOneOnOneMobileLayout } from "./OneOnOneMobileLayout";
import { makeSpotlightExpandedLayout } from "./SpotlightExpandedLayout";
import { makeOneOnOneDesktopLayout } from "./OneOnOneDesktopLayout";

// Grid supplies these hooks to the layouts it renders; on their own the
// layouts have no grid to report to
vi.mock("./Grid", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUpdateLayout: (): void => {},
  useVisibleTiles: (): void => {},
}));

const minBounds$ = constant({ width: 800, height: 800 });

const spotlight = {
  vm: new SpotlightTileViewModel(
    constant([]),
    constant(false),
    constant("solid"),
  ),
  alignment$: constant<Alignment>({ inline: "end", block: "end" }),
  onDrag: () => {},
};
const grid = Array.from(
  { length: 3 },
  () => new GridTileViewModel(constant({} as UserMediaViewModel)),
);
const pip = {
  alignment$: constant<Alignment>({ inline: "end", block: "end" }),
  onDrag: () => {},
  vm: { id: "pip" } as GridTileViewModel,
  size$: constant("sm" as const),
};

const Slot: LayoutProps<unknown, TileViewModel, HTMLDivElement>["Slot"] = ({
  id,
  model,
  onDrag,
  children,
  ...props
}) => (
  <div data-testid={`slot-${id}`} {...props}>
    {children}
  </div>
);

function snapshotLayout<Model>(layout: CallLayout<Model>, model: Model): void {
  const {
    foreground,
    scrolling: Scrolling,
    fixed: Fixed,
  } = layout({ minBounds$ });
  const scrollingLayer = <Scrolling model={model} Slot={Slot} />;
  const fixedLayer = <Fixed model={model} Slot={Slot} />;
  const { container } = render(
    foreground === "fixed" ? (
      <>
        {scrollingLayer}
        {fixedLayer}
      </>
    ) : (
      <>
        {fixedLayer}
        {scrollingLayer}
      </>
    ),
  );
  expect(container).toMatchSnapshot();
}

test("grid layout", () =>
  snapshotLayout(makeGridLayout, {
    type: "grid",
    spotlight,
    grid,
    setVisibleTiles: () => {},
  }));

test("spotlight landscape layout", () =>
  snapshotLayout(makeSpotlightLandscapeLayout, {
    type: "spotlight-landscape",
    spotlight,
    grid,
    setVisibleTiles: () => {},
  }));

test("spotlight portrait layout", () =>
  snapshotLayout(makeSpotlightPortraitLayout, {
    type: "spotlight-portrait",
    spotlight,
    grid,
    setVisibleTiles: () => {},
  }));

test("spotlight expanded layout", () =>
  snapshotLayout(makeSpotlightExpandedLayout, {
    type: "spotlight-expanded",
    spotlight: spotlight.vm,
    pip,
  }));

test("one-on-one desktop layout", () =>
  snapshotLayout(makeOneOnOneDesktopLayout, {
    type: "one-on-one-desktop",
    spotlight: { id: "spotlight" } as GridTileViewModel,
    pip,
  }));

test("one-on-one mobile layout", () =>
  snapshotLayout(makeOneOnOneMobileLayout, {
    type: "one-on-one-mobile",
    spotlight: spotlight.vm,
    pip,
  }));
