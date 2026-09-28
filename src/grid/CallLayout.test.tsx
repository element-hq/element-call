/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { act, render, screen } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { arrangeTiles, type Bounds } from "./CallLayout";
import { makeGridLayout } from "./GridLayout";
import { makeSpotlightLandscapeLayout } from "./SpotlightLandscapeLayout";
import { makeSpotlightPortraitLayout } from "./SpotlightPortraitLayout";
import { type LayoutProps } from "./Grid";
import { constant } from "../state/Behavior";
import {
  type Alignment,
  type GridLayout,
  type SpotlightLandscapeLayout,
  type SpotlightPortraitLayout,
} from "../state/layout-types";
import { type UserMediaViewModel } from "../state/media/UserMediaViewModel";
import {
  GridTileViewModel,
  SpotlightTileViewModel,
  type TileViewModel,
} from "../state/TileViewModel";

// Grid supplies these hooks to the layouts it renders; on their own the
// layouts have no grid to report to
vi.mock("./Grid", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUpdateLayout: (): void => {},
  useVisibleTiles: (): void => {},
}));

describe("grid layout", () => {
  it("sizes the tiles from the minimum bounds", () => {
    const minBounds$ = new BehaviorSubject<Bounds>({ width: 800, height: 600 });
    const { scrolling: Scrolling } = makeGridLayout({ minBounds$ });
    render(<Scrolling model={gridModel()} Slot={Slot} />);
    const layer = screen.getByTestId("slot-0").parentElement!;
    expect(layer.style.width).toBe("800px");
    expect(layer.style.getPropertyValue("--width")).toBe(
      `${Math.floor(arrangeTiles(800, 600, 3).tileWidth)}px`,
    );

    act(() => minBounds$.next({ width: 400, height: 300 }));
    expect(layer.style.width).toBe("400px");
    expect(layer.style.getPropertyValue("--width")).toBe(
      `${Math.floor(arrangeTiles(400, 300, 3).tileWidth)}px`,
    );
  });
});

describe("spotlight landscape layout", () => {
  it("puts the spotlight in the fixed layer and the grid in the scrolling one", () => {
    const { fixed: Fixed, scrolling: Scrolling } = makeSpotlightLandscapeLayout(
      { minBounds$: bounds },
    );
    const model = landscapeModel();
    const { unmount } = render(<Fixed model={model} Slot={Slot} />);
    expect(screen.getByTestId("slot-spotlight")).toBeInTheDocument();
    unmount();

    render(<Scrolling model={model} Slot={Slot} />);
    expect(slotIds()).toEqual(model.grid.map((tile) => tile.id));
  });
});

describe("spotlight portrait layout", () => {
  it("sizes the grid tiles from the minimum width", () => {
    const minBounds$ = new BehaviorSubject<Bounds>({ width: 300, height: 700 });
    const { scrolling: Scrolling } = makeSpotlightPortraitLayout({
      minBounds$,
    });
    const model = portraitModel();
    render(<Scrolling model={model} Slot={Slot} />);
    expect(slotIds()).toEqual(model.grid.map((tile) => tile.id));
    const layer = screen.getByTestId(`slot-${model.grid[0].id}`).parentElement!
      .parentElement!;
    expect(layer.style.getPropertyValue("--grid-tile-width")).toBe(
      `${Math.floor(arrangeTiles(300, 300, 3).tileWidth)}px`,
    );

    act(() => minBounds$.next({ width: 500, height: 700 }));
    expect(layer.style.getPropertyValue("--grid-tile-width")).toBe(
      `${Math.floor(arrangeTiles(500, 500, 3).tileWidth)}px`,
    );
  });
});

const bounds = constant<Bounds>({ width: 800, height: 600 });

// The layouts only pass tile view models through to their slots
const media = {} as UserMediaViewModel;
const spotlight = {
  vm: new SpotlightTileViewModel(
    constant([]),
    constant(false),
    constant("solid"),
  ),
  alignment$: constant<Alignment>({ inline: "end", block: "end" }),
  onDrag: () => {},
};
const tiles = (): GridTileViewModel[] =>
  Array.from({ length: 3 }, () => new GridTileViewModel(constant(media)));

function gridModel(): GridLayout {
  return {
    type: "grid",
    spotlight,
    grid: tiles(),
    setVisibleTiles: () => {},
  };
}

function landscapeModel(): SpotlightLandscapeLayout {
  return {
    type: "spotlight-landscape",
    spotlight,
    grid: tiles(),
    setVisibleTiles: () => {},
  };
}

function portraitModel(): SpotlightPortraitLayout {
  return {
    type: "spotlight-portrait",
    spotlight,
    grid: tiles(),
    setVisibleTiles: () => {},
  };
}

// Slots show the id of the tile they hold
const Slot: LayoutProps<unknown, TileViewModel, HTMLDivElement>["Slot"] = ({
  id,
  model,
  onDrag,
  ...props
}) => (
  <div data-testid={`slot-${id}`} {...props}>
    {model instanceof GridTileViewModel ? model.id : "spotlight"}
  </div>
);

function slotIds(): string[] {
  return screen
    .getAllByTestId(/^slot-/)
    .map((slot) => slot.textContent ?? "")
    .filter((id) => id !== "spotlight");
}
