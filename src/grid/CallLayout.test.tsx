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
import { type DragCallback, type LayoutProps } from "./Grid";
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

  it("moves the spotlight only when a drag reaches another corner", () => {
    const model = gridModel();
    const { fixed: Fixed } = makeGridLayout({ minBounds$: bounds });
    render(<Fixed model={model} Slot={Slot} />);
    const alignments: Alignment[] = [];
    model.spotlightAlignment$.subscribe((a) => alignments.push(a));
    const drag = drags.get("spotlight")!;

    // Still in the bottom right corner
    act(() => drag({ x: 0, y: 0, xRatio: 0.9, yRatio: 0.9 }));
    // Over to the bottom left
    act(() => drag({ x: 0, y: 0, xRatio: 0.1, yRatio: 0.9 }));
    // And a little further, still bottom left
    act(() => drag({ x: 0, y: 0, xRatio: 0.2, yRatio: 0.8 }));
    // Up to the top left
    act(() => drag({ x: 0, y: 0, xRatio: 0.2, yRatio: 0.1 }));

    expect(alignments).toEqual([
      { inline: "end", block: "end" },
      { inline: "start", block: "end" },
      { inline: "start", block: "start" },
    ]);
    const slot = screen.getByTestId("slot-spotlight");
    expect(slot.getAttribute("data-inline-alignment")).toBe("start");
    expect(slot.getAttribute("data-block-alignment")).toBe("start");
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
const spotlight = new SpotlightTileViewModel(
  constant([]),
  constant(false),
  constant("solid"),
);
const tiles = (): GridTileViewModel[] =>
  Array.from({ length: 3 }, () => new GridTileViewModel(constant(media)));

function gridModel(): GridLayout {
  return {
    type: "grid",
    spotlight,
    grid: tiles(),
    spotlightAlignment$: new BehaviorSubject<Alignment>({
      inline: "end",
      block: "end",
    }),
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

// Slots record their drag callback so a test can drag them, and show the id
// of the tile they hold
const drags = new Map<string, DragCallback | undefined>();
const Slot: LayoutProps<unknown, TileViewModel, HTMLDivElement>["Slot"] = ({
  id,
  model,
  onDrag,
  ...props
}) => {
  drags.set(id, onDrag);
  return (
    <div data-testid={`slot-${id}`} {...props}>
      {model instanceof GridTileViewModel ? model.id : "spotlight"}
    </div>
  );
};

function slotIds(): string[] {
  return screen
    .getAllByTestId(/^slot-/)
    .map((slot) => slot.textContent ?? "")
    .filter((id) => id !== "spotlight");
}
