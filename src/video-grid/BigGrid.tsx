/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import TinyQueue from "tinyqueue";
import { RectReadOnly } from "react-use-measure";
import { FC, memo, ReactNode } from "react";
import React from "react";

import { TileDescriptor } from "./VideoGrid";
import { Slot } from "./NewVideoGrid";
import { Layout } from "./Layout";
import { count, findLastIndex } from "../array-utils";
import styles from "./BigGrid.module.css";

/**
 * A 1×1 cell in a grid which belongs to a tile.
 */
interface Cell {
  /**
   * The item displayed on the tile.
   */
  readonly item: TileDescriptor<unknown>;
  /**
   * Whether this cell is the origin (top left corner) of the tile.
   */
  readonly origin: boolean;
  /**
   * The width, in columns, of the tile.
   */
  readonly columns: number;
  /**
   * The height, in rows, of the tile.
   */
  readonly rows: number;
}

export interface BigGridState {
  readonly columns: number;
  /**
   * The cells of the grid, in left-to-right top-to-bottom order.
   * undefined = empty.
   */
  readonly cells: (Cell | undefined)[];
}

interface MutableBigGridState {
  columns: number;
  /**
   * The cells of the grid, in left-to-right top-to-bottom order.
   * undefined = empty.
   */
  cells: (Cell | undefined)[];
}

/**
 * Gets the paths that tiles should travel along in the grid to reach a
 * particular destination.
 * @param dest The destination index.
 * @param g The grid.
 * @returns An array in which each cell holds the index of the next cell to move
 *   to to reach the destination, or null if it is the destination.
 */
export function getPaths(dest: number, g: BigGridState): (number | null)[] {
  const destRow = row(dest, g);
  const destColumn = column(dest, g);

  // This is Dijkstra's algorithm

  const distances = new Array<number>(dest + 1).fill(Infinity);
  distances[dest] = 0;
  const edges = new Array<number | null | undefined>(dest).fill(undefined);
  edges[dest] = null;
  const heap = new TinyQueue([dest], (i) => distances[i]);

  const visit = (curr: number, via: number) => {
    const viaCell = g.cells[via];
    const viaLargeTile =
      viaCell !== undefined && (viaCell.rows > 1 || viaCell.columns > 1);
    // Since it looks nicer to have paths go around large tiles, we impose an
    // increased cost for moving through them
    const distanceVia = distances[via] + (viaLargeTile ? 8 : 1);

    if (distanceVia < distances[curr]) {
      distances[curr] = distanceVia;
      edges[curr] = via;
      heap.push(curr);
    }
  };

  while (heap.length > 0) {
    const via = heap.pop()!;
    const viaRow = row(via, g);
    const viaColumn = column(via, g);

    // Visit each neighbor
    if (viaRow > 0) visit(via - g.columns, via);
    if (viaColumn > 0) visit(via - 1, via);
    if (viaColumn < (viaRow === destRow ? destColumn : g.columns - 1))
      visit(via + 1, via);
    if (
      viaRow < destRow - 1 ||
      (viaRow === destRow - 1 && viaColumn <= destColumn)
    )
      visit(via + g.columns, via);
  }

  // The heap is empty, so we've generated all paths
  return edges as (number | null)[];
}

const findLast1By1Index = (g: BigGridState): number | null =>
  findLastIndex(g.cells, (c) => c?.rows === 1 && c?.columns === 1);

export function row(index: number, g: BigGridState): number {
  return Math.floor(index / g.columns);
}

export function column(index: number, g: BigGridState): number {
  return ((index % g.columns) + g.columns) % g.columns;
}

function inArea(
  index: number,
  start: number,
  end: number,
  g: BigGridState
): boolean {
  const indexColumn = column(index, g);
  const indexRow = row(index, g);
  return (
    indexRow >= row(start, g) &&
    indexRow <= row(end, g) &&
    indexColumn >= column(start, g) &&
    indexColumn <= column(end, g)
  );
}

function* cellsInArea(
  start: number,
  end: number,
  g: BigGridState
): Generator<number, void, unknown> {
  const startColumn = column(start, g);
  const endColumn = column(end, g);
  for (
    let i = start;
    i <= end;
    i =
      column(i, g) === endColumn
        ? i + g.columns + startColumn - endColumn
        : i + 1
  )
    yield i;
}

export function forEachCellInArea(
  start: number,
  end: number,
  g: BigGridState,
  fn: (c: Cell | undefined, i: number) => void
): void {
  for (const i of cellsInArea(start, end, g)) fn(g.cells[i], i);
}

function allCellsInArea(
  start: number,
  end: number,
  g: BigGridState,
  fn: (c: Cell | undefined, i: number) => boolean
): boolean {
  for (const i of cellsInArea(start, end, g)) {
    if (!fn(g.cells[i], i)) return false;
  }

  return true;
}

const areaEnd = (
  start: number,
  columns: number,
  rows: number,
  g: BigGridState
): number => start + columns - 1 + g.columns * (rows - 1);

const cloneGrid = (g: BigGridState): BigGridState => ({
  ...g,
  cells: [...g.cells],
});

/**
 * Gets the index of the next gap in the grid that should be backfilled by 1×1
 * tiles.
 */
function getNextGap(g: BigGridState): number | null {
  const last1By1Index = findLast1By1Index(g);
  if (last1By1Index === null) return null;

  for (let i = 0; i < last1By1Index; i++) {
    // To make the backfilling process look natural when there are multiple
    // gaps, we actually scan each row from right to left
    const j =
      (row(i, g) === row(last1By1Index, g)
        ? last1By1Index
        : (row(i, g) + 1) * g.columns) -
      1 -
      column(i, g);

    if (g.cells[j] === undefined) return j;
  }

  return null;
}

/**
 * Gets the index of the origin of the tile to which the given cell belongs.
 */
function getOrigin(g: BigGridState, index: number): number {
  const initialColumn = column(index, g);

  for (
    let i = index;
    i >= 0;
    i = column(i, g) === 0 ? i - g.columns + initialColumn : i - 1
  ) {
    const cell = g.cells[i];
    if (
      cell !== undefined &&
      cell.origin &&
      inArea(index, i, areaEnd(i, cell.columns, cell.rows, g), g)
    )
      return i;
  }

  throw new Error("Tile is broken");
}

/**
 * Moves the tile at index "from" over to index "to", displacing other tiles
 * along the way.
 * Precondition: the destination area must consist of only 1×1 tiles.
 */
function moveTileUnchecked(g: BigGridState, from: number, to: number) {
  const tile = g.cells[from]!;
  const fromEnd = areaEnd(from, tile.columns, tile.rows, g);
  const toEnd = areaEnd(to, tile.columns, tile.rows, g);

  const displacedTiles: Cell[] = [];
  forEachCellInArea(to, toEnd, g, (c, i) => {
    if (c !== undefined && !inArea(i, from, fromEnd, g)) displacedTiles.push(c);
  });

  const movingCells: Cell[] = [];
  forEachCellInArea(from, fromEnd, g, (c, i) => {
    movingCells.push(c!);
    g.cells[i] = undefined;
  });

  forEachCellInArea(
    to,
    toEnd,
    g,
    (_c, i) => (g.cells[i] = movingCells.shift())
  );
  forEachCellInArea(
    from,
    fromEnd,
    g,
    (_c, i) => (g.cells[i] ??= displacedTiles.shift())
  );
}

/**
 * Moves the tile at index "from" over to index "to", if there is space.
 */
export function moveTile(
  g: BigGridState,
  from: number,
  to: number
): BigGridState {
  const tile = g.cells[from]!;

  if (
    to !== from && // Skip the operation if nothing would move
    to >= 0 &&
    to < g.cells.length &&
    column(to, g) <= g.columns - tile.columns
  ) {
    const fromEnd = areaEnd(from, tile.columns, tile.rows, g);
    const toEnd = areaEnd(to, tile.columns, tile.rows, g);

    // The contents of a given cell are 'displaceable' if it's empty, holds a
    // 1×1 tile, or is part of the original tile we're trying to reposition
    const displaceable = (c: Cell | undefined, i: number): boolean =>
      c === undefined ||
      (c.columns === 1 && c.rows === 1) ||
      inArea(i, from, fromEnd, g);

    if (allCellsInArea(to, toEnd, g, displaceable)) {
      // The target space is free; move
      const gClone = cloneGrid(g);
      moveTileUnchecked(gClone, from, to);
      return gClone;
    }
  }

  // The target space isn't free; don't move
  return g;
}

/**
 * Attempts to push a tile upwards by one row, displacing 1×1 tiles and shifting
 * enlarged tiles around when necessary.
 * @returns Whether the tile was actually pushed
 */
function pushTileUp(g: BigGridState, from: number): boolean {
  const tile = g.cells[from]!;

  // TODO: pushing large tiles sideways might be more successful in some
  // situations
  const cellsAboveAreDisplacable =
    from - g.columns >= 0 &&
    allCellsInArea(
      from - g.columns,
      from - g.columns + tile.columns - 1,
      g,
      (c, i) =>
        c === undefined ||
        (c.columns === 1 && c.rows === 1) ||
        pushTileUp(g, getOrigin(g, i))
    );

  if (cellsAboveAreDisplacable) {
    moveTileUnchecked(g, from, from - g.columns);
    return true;
  } else {
    return false;
  }
}

/**
 * Backfill any gaps in the grid.
 */
export function fillGaps(g: BigGridState): BigGridState {
  const result = cloneGrid(g) as MutableBigGridState;

  // This will hopefully be the size of the grid after we're done here, assuming
  // that we can pack the large tiles tightly enough
  const idealLength = count(result.cells, (c) => c !== undefined);

  // Step 1: Take any large tiles hanging off the bottom of the grid, and push
  // them upwards
  for (let i = result.cells.length - 1; i >= idealLength; i--) {
    const cell = result.cells[i];
    if (cell !== undefined && (cell.columns > 1 || cell.rows > 1)) {
      const originIndex =
        i - (cell.columns - 1) - result.columns * (cell.rows - 1);
      // If it's not possible to pack the large tiles any tighter, give up
      if (!pushTileUp(result, originIndex)) break;
    }
  }

  // Step 2: Fill all 1×1 gaps
  let gap = getNextGap(result);

  if (gap !== null) {
    const pathsToEnd = getPaths(findLast1By1Index(result)!, result);

    do {
      let filled = false;
      let to = gap;
      let from = pathsToEnd[gap];

      // First, attempt to fill the gap by moving 1×1 tiles backwards from the
      // end of the grid along a set path
      while (from !== null) {
        const toCell = result.cells[to];
        const fromCell = result.cells[from];

        // Skip over slots that are already full
        if (toCell !== undefined) {
          to = pathsToEnd[to]!;
          // Skip over large tiles. Also, we might run into gaps along the path
          // created during the filling of previous gaps. Skip over those too;
          // they'll be picked up on the next iteration of the outer loop.
        } else if (
          fromCell === undefined ||
          fromCell.rows > 1 ||
          fromCell.columns > 1
        ) {
          from = pathsToEnd[from];
        } else {
          result.cells[to] = result.cells[from];
          result.cells[from] = undefined;
          filled = true;
          to = pathsToEnd[to]!;
          from = pathsToEnd[from];
        }
      }

      // In case the path approach failed, fall back to taking the very last 1×1
      // tile, and just dropping it into place
      if (!filled) {
        const last1By1Index = findLast1By1Index(result)!;
        result.cells[gap] = result.cells[last1By1Index];
        result.cells[last1By1Index] = undefined;
      }

      gap = getNextGap(result);
    } while (gap !== null);
  }

  // Shrink the array to remove trailing gaps
  const finalLength =
    (findLastIndex(result.cells, (c) => c !== undefined) ?? -1) + 1;
  if (finalLength < result.cells.length)
    result.cells = result.cells.slice(0, finalLength);

  return result;
}

function createRows(
  g: BigGridState,
  count: number,
  atRow: number
): BigGridState {
  const result = {
    columns: g.columns,
    cells: new Array(g.cells.length + g.columns * count),
  };
  const offsetAfterNewRows = g.columns * count;

  // Copy tiles from the original grid to the new one, with the new rows
  // inserted at the target location
  g.cells.forEach((c, from) => {
    if (c?.origin) {
      const offset = row(from, g) >= atRow ? offsetAfterNewRows : 0;
      forEachCellInArea(
        from,
        areaEnd(from, c.columns, c.rows, g),
        g,
        (c, i) => {
          result.cells[i + offset] = c;
        }
      );
    }
  });

  return result;
}

/**
 * Adds a set of new items into the grid. (May leave gaps.)
 */
export function addItems(
  items: TileDescriptor<unknown>[],
  g: BigGridState
): BigGridState {
  let result = cloneGrid(g);

  for (const item of items) {
    const cell = {
      item,
      origin: true,
      columns: 1,
      rows: 1,
    };

    let placeAt: number;

    if (item.placeNear === undefined) {
      // This item has no special placement requests, so let's put it
      // uneventfully at the end of the grid
      placeAt = result.cells.length;
    } else {
      // This item wants to be placed near another; let's put it on a row
      // directly below the related tile
      const placeNear = result.cells.findIndex(
        (c) => c?.item.id === item.placeNear
      );
      if (placeNear === -1) {
        // Can't find the related tile, so let's give up and place it at the end
        placeAt = result.cells.length;
      } else {
        const placeNearCell = result.cells[placeNear]!;
        const placeNearEnd = areaEnd(
          placeNear,
          placeNearCell.columns,
          placeNearCell.rows,
          result
        );

        result = createRows(result, 1, row(placeNearEnd, result) + 1);
        placeAt =
          placeNear +
          Math.floor(placeNearCell.columns / 2) +
          result.columns * placeNearCell.rows;
      }
    }

    result.cells[placeAt] = cell;

    if (item.largeBaseSize) {
      // Cycle the tile size once to set up the tile with its larger base size
      // This also fills any gaps in the grid, hence no extra call to fillGaps
      result = cycleTileSize(result, item);
    }
  }

  return result;
}

const largeTileDimensions = (g: BigGridState): [number, number] => [
  Math.min(3, Math.max(2, g.columns - 1)),
  2,
];

const extraLargeTileDimensions = (g: BigGridState): [number, number] =>
  g.columns > 3 ? [4, 3] : [g.columns, 2];

/**
 * Changes the size of a tile, rearranging the grid to make space.
 * @param tileId The ID of the tile to modify.
 * @param g The grid.
 * @returns The updated grid.
 */
export function cycleTileSize(
  g: BigGridState,
  tile: TileDescriptor<unknown>
): BigGridState {
  const from = g.cells.findIndex((c) => c?.item === tile);
  if (from === -1) return g; // Tile removed, no change
  const fromCell = g.cells[from]!;
  const fromWidth = fromCell.columns;
  const fromHeight = fromCell.rows;
  const fromEnd = areaEnd(from, fromWidth, fromHeight, g);

  const [baseDimensions, enlargedDimensions] = fromCell.item.largeBaseSize
    ? [largeTileDimensions(g), extraLargeTileDimensions(g)]
    : [[1, 1], largeTileDimensions(g)];
  // The target dimensions, which toggle between the base and enlarged sizes
  const [toWidth, toHeight] =
    fromWidth === baseDimensions[0] && fromHeight === baseDimensions[1]
      ? enlargedDimensions
      : baseDimensions;

  // If we're expanding the tile, we want to create enough new rows at the
  // tile's target position such that every new unit of grid area created during
  // the expansion can fit within the new rows.
  // We do it this way, since it's easier to backfill gaps in the grid than it
  // is to push colliding tiles outwards.
  const newRows = Math.max(
    0,
    Math.ceil((toWidth * toHeight - fromWidth * fromHeight) / g.columns)
  );

  // The next task is to scan for a spot to place the modified tile. Since we
  // might be creating new rows at the target position, this spot can be shorter
  // than the target height.
  const candidateWidth = toWidth;
  const candidateHeight = toHeight - newRows;

  // To make the tile appear to expand outwards from its center, we're actually
  // scanning for locations to put the *center* of the tile. These numbers are
  // the offsets between the tile's origin and its center.
  const scanColumnOffset = Math.floor((toWidth - fromWidth) / 2);
  const scanRowOffset = Math.floor((toHeight - fromHeight) / 2);

  const nextScanLocations = new Set<number>([from]);
  const rows = row(g.cells.length - 1, g) + 1;
  let to: number | null = null;

  // The contents of a given cell are 'displaceable' if it's empty, holds a 1×1
  // tile, or is part of the original tile we're trying to reposition
  const displaceable = (c: Cell | undefined, i: number): boolean =>
    c === undefined ||
    (c.columns === 1 && c.rows === 1) ||
    inArea(i, from, fromEnd, g);

  // Do the scanning
  for (const scanLocation of nextScanLocations) {
    const start = scanLocation - scanColumnOffset - g.columns * scanRowOffset;
    const end = areaEnd(start, candidateWidth, candidateHeight, g);
    const startColumn = column(start, g);
    const startRow = row(start, g);
    const endColumn = column(end, g);
    const endRow = row(end, g);

    if (
      start >= 0 &&
      endColumn - startColumn + 1 === candidateWidth &&
      allCellsInArea(start, end, g, displaceable)
    ) {
      // This location works!
      to = start;
      break;
    }

    // Scan outwards in all directions
    if (startColumn > 0) nextScanLocations.add(scanLocation - 1);
    if (endColumn < g.columns - 1) nextScanLocations.add(scanLocation + 1);
    if (startRow > 0) nextScanLocations.add(scanLocation - g.columns);
    if (endRow < rows - 1) nextScanLocations.add(scanLocation + g.columns);
  }

  // If there is no space in the grid, give up
  if (to === null) return g;

  const toRow = row(to, g);

  // This is the grid with the new rows added
  const gappyGrid = createRows(g, newRows, toRow + candidateHeight);

  // Remove the original tile
  const fromInGappyGrid =
    from + (row(from, g) >= toRow + candidateHeight ? g.columns * newRows : 0);
  const fromEndInGappyGrid = fromInGappyGrid - from + fromEnd;
  forEachCellInArea(
    fromInGappyGrid,
    fromEndInGappyGrid,
    gappyGrid,
    (_c, i) => (gappyGrid.cells[i] = undefined)
  );

  // Place the tile in its target position, making a note of the tiles being
  // overwritten
  const displacedTiles: Cell[] = [];
  const toEnd = areaEnd(to, toWidth, toHeight, g);
  forEachCellInArea(to, toEnd, gappyGrid, (c, i) => {
    if (c !== undefined) displacedTiles.push(c);
    gappyGrid.cells[i] = {
      item: g.cells[from]!.item,
      origin: i === to,
      columns: toWidth,
      rows: toHeight,
    };
  });

  // Place the displaced tiles in the remaining space
  for (let i = 0; displacedTiles.length > 0; i++) {
    if (gappyGrid.cells[i] === undefined)
      gappyGrid.cells[i] = displacedTiles.shift();
  }

  // Fill any gaps that remain
  return fillGaps(gappyGrid);
}

/**
 * Resizes the grid to a new column width.
 */
export function resize(g: BigGridState, columns: number): BigGridState {
  const result: BigGridState = { columns, cells: [] };
  const [largeColumns, largeRows] = largeTileDimensions(result);

  // Copy each tile from the old grid to the resized one in the same order

  // The next index in the result grid to copy a tile to
  let next = 0;

  for (const cell of g.cells) {
    if (cell?.origin) {
      // TODO make aware of extra large tiles
      const [nextColumns, nextRows] =
        cell.columns > 1 || cell.rows > 1 ? [largeColumns, largeRows] : [1, 1];

      // If there isn't enough space left on this row, jump to the next row
      if (columns - column(next, result) < nextColumns)
        next = columns * (Math.floor(next / columns) + 1);
      const nextEnd = areaEnd(next, nextColumns, nextRows, result);

      // Expand the cells array as necessary
      if (result.cells.length <= nextEnd)
        result.cells.push(...new Array(nextEnd + 1 - result.cells.length));

      // Copy the tile into place
      forEachCellInArea(next, nextEnd, result, (_c, i) => {
        result.cells[i] = {
          item: cell.item,
          origin: i === next,
          columns: nextColumns,
          rows: nextRows,
        };
      });

      next = nextEnd + 1;
    }
  }

  return fillGaps(result);
}

/**
 * Promotes speakers to the first page of the grid.
 */
export function promoteSpeakers(g: BigGridState) {
  // This is all a bit of a hack right now, because we don't know if the designs
  // will stick with this approach in the long run
  // We assume that 4 rows are probably about 1 page
  const firstPageEnd = g.columns * 4;

  for (let from = firstPageEnd; from < g.cells.length; from++) {
    const fromCell = g.cells[from];
    // Don't bother trying to promote enlarged tiles
    if (
      fromCell?.item.isSpeaker &&
      fromCell.columns === 1 &&
      fromCell.rows === 1
    ) {
      // Promote this tile by making 10 attempts to place it on the first page
      for (let j = 0; j < 10; j++) {
        const to = Math.floor(Math.random() * firstPageEnd);
        const toCell = g.cells[to];
        if (
          toCell === undefined ||
          (toCell.columns === 1 && toCell.rows === 1)
        ) {
          moveTileUnchecked(g, from, to);
          break;
        }
      }
    }
  }
}

/**
 * The algorithm for updating a grid with a new set of tiles.
 */
function updateTiles(
  g: BigGridState,
  tiles: TileDescriptor<unknown>[]
): BigGridState {
  // Step 1: Update tiles that still exist, and remove tiles that have left
  // the grid
  const itemsById = new Map(tiles.map((i) => [i.id, i]));
  const grid1: BigGridState = {
    ...g,
    cells: g.cells.map((c) => {
      if (c === undefined) return undefined;
      const item = itemsById.get(c.item.id);
      return item === undefined ? undefined : { ...c, item };
    }),
  };

  // Step 2: Add new tiles
  const existingItemIds = new Set(
    grid1.cells.filter((c) => c !== undefined).map((c) => c!.item.id)
  );
  const newItems = tiles.filter((i) => !existingItemIds.has(i.id));
  const grid2 = addItems(newItems, grid1);

  // Step 3: Promote speakers to the top
  promoteSpeakers(grid2);

  return fillGaps(grid2);
}

function updateBounds(g: BigGridState, bounds: RectReadOnly): BigGridState {
  const columns = Math.max(2, Math.floor(bounds.width * 0.0045));
  return columns === g.columns ? g : resize(g, columns);
}

const Slots: FC<{ s: BigGridState }> = memo(({ s: g }) => {
  const areas = new Array<(number | null)[]>(
    Math.ceil(g.cells.length / g.columns)
  );
  for (let i = 0; i < areas.length; i++)
    areas[i] = new Array<number | null>(g.columns).fill(null);

  let slotCount = 0;
  for (let i = 0; i < g.cells.length; i++) {
    const cell = g.cells[i];
    if (cell?.origin) {
      const slotEnd = i + cell.columns - 1 + g.columns * (cell.rows - 1);
      forEachCellInArea(
        i,
        slotEnd,
        g,
        (_c, j) => (areas[row(j, g)][column(j, g)] = slotCount)
      );
      slotCount++;
    }
  }

  const style = {
    gridTemplateAreas: areas
      .map(
        (row) =>
          `'${row
            .map((slotId) => (slotId === null ? "." : `s${slotId}`))
            .join(" ")}'`
      )
      .join(" "),
    gridTemplateColumns: `repeat(${g.columns}, 1fr)`,
  };

  const slots = new Array<ReactNode>(slotCount);
  for (let i = 0; i < slotCount; i++)
    slots[i] = <Slot key={i} style={{ gridArea: `s${i}` }} />;

  return (
    <div className={styles.bigGrid} style={style}>
      {slots}
    </div>
  );
});

/**
 * Given a tile and numbers in the range [0, 1) describing a position within the
 * tile, this returns the index of the specific cell in which that position
 * lies.
 */
function positionOnTileToCell(
  g: BigGridState,
  tileOriginIndex: number,
  xPositionOnTile: number,
  yPositionOnTile: number
): number {
  const tileOrigin = g.cells[tileOriginIndex]!;
  const columnOnTile = Math.floor(xPositionOnTile * tileOrigin.columns);
  const rowOnTile = Math.floor(yPositionOnTile * tileOrigin.rows);
  return tileOriginIndex + columnOnTile + g.columns * rowOnTile;
}

function dragTile(
  g: BigGridState,
  from: TileDescriptor<unknown>,
  to: TileDescriptor<unknown>,
  xPositionOnFrom: number,
  yPositionOnFrom: number,
  xPositionOnTo: number,
  yPositionOnTo: number
): BigGridState {
  const fromOrigin = g.cells.findIndex((c) => c?.item === from);
  const toOrigin = g.cells.findIndex((c) => c?.item === to);
  const fromCell = positionOnTileToCell(
    g,
    fromOrigin,
    xPositionOnFrom,
    yPositionOnFrom
  );
  const toCell = positionOnTileToCell(
    g,
    toOrigin,
    xPositionOnTo,
    yPositionOnTo
  );

  return moveTile(g, fromOrigin, fromOrigin + toCell - fromCell);
}

export const BigGrid: Layout<BigGridState> = {
  emptyState: { columns: 4, cells: [] },
  updateTiles,
  updateBounds,
  getTiles: <T,>(g) =>
    g.cells.filter((c) => c?.origin).map((c) => c!.item as T),
  canDragTile: () => true,
  dragTile,
  toggleFocus: cycleTileSize,
  Slots,
  rememberState: false,
};
