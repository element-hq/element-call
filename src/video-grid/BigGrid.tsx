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
import { zip } from "lodash";

import { Slot } from "./NewVideoGrid";
import { Layout } from "./Layout";
import { count, findLastIndex } from "../array-utils";
import styles from "./BigGrid.module.css";
import { TileDescriptor } from "../state/CallViewModel";

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

export interface Grid {
  columns: number;
  /**
   * The cells of the grid, in left-to-right top-to-bottom order.
   */
  cells: Cell[];
}

export interface SparseGrid {
  columns: number;
  /**
   * The cells of the grid, in left-to-right top-to-bottom order.
   * undefined = a gap in the grid.
   */
  cells: (Cell | undefined)[];
}

/**
 * Gets the paths that tiles should travel along in the grid to reach a
 * particular destination.
 * @param g The grid.
 * @param dest The destination index.
 * @param avoid A predicate defining the cells that paths should avoid going
 *   through.
 * @returns An array in which each cell holds the index of the next cell to move
 *   to to reach the destination, or null if it is the destination or otherwise
 *   immovable.
 */
export function getPaths(
  g: SparseGrid,
  dest: number,
  avoid: (cell: number) => boolean = (): boolean => false,
): (number | null)[] {
  const destRow = row(dest, g);
  const destColumn = column(dest, g);

  // This is Dijkstra's algorithm

  const distances = new Array<number>(dest + 1).fill(Infinity);
  distances[dest] = 0;
  const edges = new Array<number | null>(dest).fill(null);
  edges[dest] = null;
  const heap = new TinyQueue([dest], (i) => distances[i]);

  const visit = (curr: number, via: number, distanceVia: number): void => {
    if (distanceVia < distances[curr]) {
      distances[curr] = distanceVia;
      edges[curr] = via;
      heap.push(curr);
    }
  };

  while (heap.length > 0) {
    const via = heap.pop()!;

    if (!avoid(via)) {
      const viaRow = row(via, g);
      const viaColumn = column(via, g);
      const viaCell = g.cells[via];
      const viaLargeTile = viaCell !== undefined && !is1By1(viaCell);
      // Since it looks nicer to have paths go around large tiles, we impose an
      // increased cost for moving through them
      const distanceVia = distances[via] + (viaLargeTile ? 8 : 1);

      // Visit each neighbor
      if (viaRow > 0) visit(via - g.columns, via, distanceVia);
      if (viaColumn > 0) visit(via - 1, via, distanceVia);
      if (viaColumn < (viaRow === destRow ? destColumn : g.columns - 1))
        visit(via + 1, via, distanceVia);
      if (
        viaRow < destRow - 1 ||
        (viaRow === destRow - 1 && viaColumn <= destColumn)
      )
        visit(via + g.columns, via, distanceVia);
    }
  }

  // The heap is empty, so we've generated all paths
  return edges;
}

const is1By1 = (c: Cell): boolean => c.columns === 1 && c.rows === 1;

const findLast1By1Index = (g: SparseGrid): number | null =>
  findLastIndex(g.cells, (c) => c !== undefined && is1By1(c));

export function row(index: number, g: SparseGrid): number {
  return Math.floor(index / g.columns);
}

export function column(index: number, g: SparseGrid): number {
  return ((index % g.columns) + g.columns) % g.columns;
}

function inArea(
  index: number,
  start: number,
  end: number,
  g: SparseGrid,
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
  g: SparseGrid,
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

export function forEachCellInArea<G extends Grid | SparseGrid>(
  start: number,
  end: number,
  g: G,
  fn: (c: G["cells"][0], i: number) => void,
): void {
  for (const i of cellsInArea(start, end, g)) fn(g.cells[i], i);
}

function allCellsInArea<G extends Grid | SparseGrid>(
  start: number,
  end: number,
  g: G,
  fn: (c: G["cells"][0], i: number) => boolean,
): boolean {
  for (const i of cellsInArea(start, end, g)) {
    if (!fn(g.cells[i], i)) return false;
  }

  return true;
}

/**
 * Counts the number of cells in the area that satsify the given predicate.
 */
function countCellsInArea<G extends Grid | SparseGrid>(
  start: number,
  end: number,
  g: G,
  predicate: (c: G["cells"][0], i: number) => boolean,
): number {
  let count = 0;
  for (const i of cellsInArea(start, end, g)) {
    if (predicate(g.cells[i], i)) count++;
  }
  return count;
}

const areaEnd = (
  start: number,
  columns: number,
  rows: number,
  g: SparseGrid,
): number => start + columns - 1 + g.columns * (rows - 1);

const cloneGrid = <G extends Grid | SparseGrid>(g: G): G => ({
  ...g,
  cells: [...g.cells],
});

/**
 * Gets the index of the next gap in the grid that should be backfilled by 1×1
 * tiles.
 */
function getNextGap(
  g: SparseGrid,
  ignoreGap: (cell: number) => boolean,
): number | null {
  const last1By1Index = findLast1By1Index(g);
  if (last1By1Index === null) return null;

  for (let i = 0; i < last1By1Index; i++) {
    // To make the backfilling process look natural when there are multiple
    // gaps, we actually scan each row from right to left
    const j = i; /*
      (row(i, g) === row(last1By1Index, g)
        ? last1By1Index
        : (row(i, g) + 1) * g.columns) -
      1 -
      column(i, g);*/

    if (!ignoreGap(j) && g.cells[j] === undefined) return j;
  }

  return null;
}

/**
 * Moves the tile at index "from" over to index "to", displacing other tiles
 * along the way.
 * Precondition: the destination area must consist of only 1×1 tiles.
 */
function moveTileUnchecked(g: SparseGrid, from: number, to: number): void {
  const tile = g.cells[from]!;
  const fromEnd = areaEnd(from, tile.columns, tile.rows, g);
  const toEnd = areaEnd(to, tile.columns, tile.rows, g);

  const displacedTiles: Cell[] = [];
  forEachCellInArea(to, toEnd, g, (c, i) => {
    if (c !== undefined && !inArea(i, from, fromEnd, g))
      displacedTiles.push(c!);
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
    (_c, i) => (g.cells[i] = movingCells.shift()),
  );
  forEachCellInArea(
    from,
    fromEnd,
    g,
    (_c, i) => (g.cells[i] ??= displacedTiles.shift()),
  );
}

/**
 * Moves the tile at index "from" over to index "to", if there is space.
 */
export function moveTile<G extends Grid | SparseGrid>(
  g: G,
  from: number,
  to: number,
): G {
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
      c === undefined || is1By1(c) || inArea(i, from, fromEnd, g);

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
 * Attempts to push a tile upwards by a number of rows, displacing 1×1 tiles.
 * @returns The number of rows the tile was successfully pushed (may be less
 *   than requested if there are obstacles blocking movement).
 */
function pushTileUp(
  g: SparseGrid,
  from: number,
  rows: number,
  avoid: (cell: number) => boolean = (): boolean => false,
): number {
  const tile = g.cells[from]!;

  for (let tryRows = rows; tryRows > 0; tryRows--) {
    const to = from - tryRows * g.columns;
    const toEnd = areaEnd(to, tile.columns, tile.rows, g);

    const cellsAboveAreDisplacable =
      from - g.columns >= 0 &&
      allCellsInArea(
        to,
        Math.min(from - g.columns + tile.columns - 1, toEnd),
        g,
        (c, i) => (c === undefined || is1By1(c)) && !avoid(i),
      );

    if (cellsAboveAreDisplacable) {
      moveTileUnchecked(g, from, to);
      return tryRows;
    }
  }

  return 0;
}

function trimTrailingGaps(g: SparseGrid): void {
  // Shrink the array to remove trailing gaps
  const newLength = (findLastIndex(g.cells, (c) => c !== undefined) ?? -1) + 1;
  if (newLength !== g.cells.length) g.cells = g.cells.slice(0, newLength);
}

/**
 * Determines whether the given area is sufficiently clear of obstacles for
 * vacateArea to work.
 */
function canVacateArea(g: SparseGrid, start: number, end: number): boolean {
  const newCellCount = countCellsInArea(start, end, g, (c) => c !== undefined);
  const newFullRows = Math.floor(newCellCount / g.columns);
  return allCellsInArea(
    start,
    end - newFullRows * g.columns,
    g,
    (c) => c === undefined || is1By1(c),
  );
}

/**
 * Clears away all the tiles in a given area by pushing them elsewhere.
 * Precondition: the area must first be checked with canVacateArea, and the only
 * gaps in the given grid must lie either within the area being cleared, or
 * after the last 1×1 tile.
 */
function vacateArea(g: SparseGrid, start: number, end: number): SparseGrid {
  const newCellCount = countCellsInArea(
    start,
    end,
    g,
    (c, i) => c !== undefined || i >= g.cells.length,
  );
  const newFullRows = Math.floor(newCellCount / g.columns);
  const endRow = row(end, g);

  // To avoid subverting users' expectations, this operation should be the exact
  // inverse of fillGaps. We do this by reverse-engineering a grid G with the
  // area cleared out and structured such that fillGaps(G) = g.

  // A grid that will have the same structure as the final result, but be filled
  // with fake data
  const outputStructure: SparseGrid = {
    columns: g.columns,
    cells: new Array(g.cells.length + newCellCount),
  };

  // The first step in populating outputStructure is to copy over all the large
  // tiles, pushing those tiles downwards that fillGaps would push upwards
  g.cells.forEach((cell, fromStart) => {
    if (cell?.origin && !is1By1(cell)) {
      const fromEnd = areaEnd(fromStart, cell.columns, cell.rows, g);
      const offset =
        row(fromStart, g) + newFullRows > endRow ? newFullRows * g.columns : 0;
      forEachCellInArea(fromStart, fromEnd, g, (c, i) => {
        outputStructure.cells[i + offset] = c;
      });
    }
  });

  // Then, we need to fill it in with the same number of 1×1 tiles as appear in
  // the input
  const oneByOneTileCount = count(g.cells, (c) => c !== undefined && is1By1(c));
  let oneByOneTilesDistributed = 0;

  for (let i = 0; i < outputStructure.cells.length; i++) {
    if (outputStructure.cells[i] === undefined) {
      if (inArea(i, start, end, g)) {
        // Leave the requested area clear
        outputStructure.cells[i] = undefined;
      } else if (oneByOneTilesDistributed < oneByOneTileCount) {
        outputStructure.cells[i] = {
          // Fake data because we only care about the grid's structure
          item: {} as unknown as TileDescriptor<unknown>,
          origin: true,
          columns: 1,
          rows: 1,
        };
        oneByOneTilesDistributed++;
      }
    }
  }

  // Lastly, handle the edge case where there were gaps in the input after the
  // last 1×1 tile by resizing the cells array to delete these gaps
  trimTrailingGaps(outputStructure);

  // outputStructure is now fully populated, and so running fillGaps on it
  // should produce a grid with the same structure as the input
  const inputStructure = fillGaps(
    outputStructure,
    false,
    (i) => inArea(i, start, end, g) && g.cells[i] === undefined,
  );

  // We exploit the fact that g and inputStructure have the same structure to
  // create a mapping between cells in the structure grids and cells in g
  const structureMapping = new Map(zip(inputStructure.cells, g.cells));

  // And finally, we can use that mapping to swap the fake data in
  // outputStructure with the real thing
  return {
    columns: g.columns,
    cells: outputStructure.cells.map((placeholder) =>
      structureMapping.get(placeholder),
    ),
  };
}

/**
 * Backfill any gaps in the grid.
 */
export function fillGaps(
  g: SparseGrid,
  packLargeTiles?: true,
  ignoreGap?: () => false,
): Grid;
export function fillGaps(
  g: SparseGrid,
  packLargeTiles?: boolean,
  ignoreGap?: (cell: number) => boolean,
): SparseGrid;
export function fillGaps(
  g: SparseGrid,
  packLargeTiles = true,
  ignoreGap: (cell: number) => boolean = (): boolean => false,
): SparseGrid {
  const lastGap = findLastIndex(
    g.cells,
    (c, i) => c === undefined && !ignoreGap(i),
  );
  if (lastGap === null) return g; // There are no gaps to fill
  const lastGapRow = row(lastGap, g);

  const result = cloneGrid(g);

  // This will be the size of the grid after we're done here (assuming we're
  // allowed to pack the large tiles into the rest of the grid as necessary)
  let idealLength = count(
    result.cells,
    (c, i) => c !== undefined || ignoreGap(i),
  );
  const fullRowsRemoved = Math.floor(
    (g.cells.length - idealLength) / g.columns,
  );

  // Step 1: Push all large tiles below the last gap upwards, so that they move
  // roughly the same distance that we're expecting 1×1 tiles to move
  if (fullRowsRemoved > 0) {
    for (
      let i = (lastGapRow + 1) * result.columns;
      i < result.cells.length;
      i++
    ) {
      const cell = result.cells[i];
      if (cell?.origin && !is1By1(cell))
        pushTileUp(result, i, fullRowsRemoved, ignoreGap);
    }
  }

  // Step 2: Deal with any large tiles that are still hanging off the bottom
  if (packLargeTiles) {
    for (let i = result.cells.length - 1; i >= idealLength; i--) {
      const cell = result.cells[i];
      if (cell !== undefined && !is1By1(cell)) {
        // First, try to just push it upwards a bit more
        const originIndex =
          i - (cell.columns - 1) - result.columns * (cell.rows - 1);
        const pushed = pushTileUp(result, originIndex, 1, ignoreGap) === 1;

        // If that failed, collapse the tile to 1×1 so it can be dealt with in
        // step 3
        if (!pushed) {
          const collapsedTile: Cell = {
            item: cell.item,
            origin: true,
            columns: 1,
            rows: 1,
          };
          forEachCellInArea(originIndex, i, result, (_c, j) => {
            result.cells[j] = undefined;
          });
          result.cells[i] = collapsedTile;
          // Collapsing the tile makes the final grid size smaller
          idealLength -= cell.columns * cell.rows - 1;
        }
      }
    }
  }

  // Step 3: Fill all remaining gaps with 1×1 tiles
  let gap = getNextGap(result, ignoreGap);

  if (gap !== null) {
    const pathsToEnd = getPaths(result, findLast1By1Index(result)!, ignoreGap);

    do {
      let filled = false;
      let to = gap;
      let from = pathsToEnd[gap];

      // First, attempt to fill the gap by moving 1×1 tiles backwards from the
      // end of the grid along a set path
      while (from !== null) {
        const toCell = result.cells[to] as Cell | undefined;
        const fromCell = result.cells[from] as Cell | undefined;

        // Skip over slots that are already full
        if (toCell !== undefined) {
          to = pathsToEnd[to]!;
          // Skip over large tiles. Also, we might run into gaps along the path
          // created during the filling of previous gaps. Skip over those too;
          // they'll be picked up on the next iteration of the outer loop.
        } else if (fromCell === undefined || !is1By1(fromCell)) {
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

      gap = getNextGap(result, ignoreGap);
    } while (gap !== null);
  }

  trimTrailingGaps(result);
  return result;
}

// TODO: replace all usages of this function with vacateArea, as this results in
// somewhat unpredictable movement
function createRows(g: SparseGrid, count: number, atRow: number): SparseGrid {
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
        },
      );
    }
  });

  return result;
}

/**
 * Adds a set of new items into the grid.
 */
export function addItems(
  items: TileDescriptor<unknown>[],
  g: SparseGrid,
): SparseGrid {
  let result: SparseGrid = cloneGrid(g);

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
        (c) => c?.item.id === item.placeNear,
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
          result,
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

const largeTileDimensions = (g: SparseGrid): [number, number] => [
  Math.min(3, Math.max(2, g.columns - 1)),
  2,
];

const extraLargeTileDimensions = (g: SparseGrid): [number, number] =>
  g.columns > 3 ? [4, 3] : [g.columns, 2];

export function cycleTileSize<G extends Grid | SparseGrid>(
  g: G,
  tile: TileDescriptor<unknown>,
): G {
  const from = g.cells.findIndex((c) => c?.item === tile);
  if (from === -1) return g; // Tile removed, no change
  const fromCell = g.cells[from]!;
  const fromWidth = fromCell.columns;
  const fromHeight = fromCell.rows;

  const [baseDimensions, enlargedDimensions] = fromCell.item.largeBaseSize
    ? [largeTileDimensions(g), extraLargeTileDimensions(g)]
    : [[1, 1], largeTileDimensions(g)];
  // The target dimensions, which toggle between the base and enlarged sizes
  const [toWidth, toHeight] =
    fromWidth === baseDimensions[0] && fromHeight === baseDimensions[1]
      ? enlargedDimensions
      : baseDimensions;

  return setTileSize(g, from, toWidth, toHeight);
}

/**
 * Finds the cell nearest to 'nearestTo' that satsifies the given predicate.
 * @param shouldScan A predicate constraining the bounds of the search.
 */
function findNearestCell<G extends Grid | SparseGrid>(
  g: G,
  nearestTo: number,
  shouldScan: (index: number) => boolean,
  predicate: (cell: G["cells"][0], index: number) => boolean,
): number | null {
  const scanLocations = new Set([nearestTo]);

  for (const scanLocation of scanLocations) {
    if (shouldScan(scanLocation)) {
      if (predicate(g.cells[scanLocation], scanLocation)) return scanLocation;

      // Scan outwards in all directions
      const scanColumn = column(scanLocation, g);
      const scanRow = row(scanLocation, g);
      if (scanColumn > 0) scanLocations.add(scanLocation - 1);
      if (scanColumn < g.columns - 1) scanLocations.add(scanLocation + 1);
      if (scanRow > 0) scanLocations.add(scanLocation - g.columns);
      scanLocations.add(scanLocation + g.columns);
    }
  }

  return null;
}

/**
 * Changes the size of a tile, rearranging the grid to make space.
 * @param tileId The ID of the tile to modify.
 * @param g The grid.
 * @returns The updated grid.
 */
export function setTileSize<G extends Grid | SparseGrid>(
  g: G,
  from: number,
  toWidth: number,
  toHeight: number,
): G {
  const fromCell = g.cells[from]!;
  const fromWidth = fromCell.columns;
  const fromHeight = fromCell.rows;
  const fromEnd = areaEnd(from, fromWidth, fromHeight, g);
  const newGridSize =
    g.cells.length + toWidth * toHeight - fromWidth * fromHeight;

  const toColumn = Math.max(
    0,
    Math.min(
      g.columns - toWidth,
      column(from, g) + Math.trunc((fromWidth - toWidth) / 2),
    ),
  );
  const toRow = Math.max(
    0,
    row(from, g) + Math.trunc((fromHeight - toHeight) / 2),
  );
  const targetDest = toColumn + toRow * g.columns;

  const gridWithoutTile = cloneGrid(g);
  forEachCellInArea(from, fromEnd, gridWithoutTile, (_c, i) => {
    gridWithoutTile.cells[i] = undefined;
  });

  const placeTile = (
    to: number,
    toEnd: number,
    grid: Grid | SparseGrid,
  ): void => {
    forEachCellInArea(to, toEnd, grid, (_c, i) => {
      grid.cells[i] = {
        item: fromCell.item,
        origin: i === to,
        columns: toWidth,
        rows: toHeight,
      };
    });
  };

  if (toWidth <= fromWidth && toHeight <= fromHeight) {
    // The tile is shrinking, which can always happen in-place
    const to = targetDest;
    const toEnd = areaEnd(to, toWidth, toHeight, g);

    const result: SparseGrid = gridWithoutTile;
    placeTile(to, toEnd, result);
    return fillGaps(result, true, (i: number) => inArea(i, to, toEnd, g)) as G;
  } else if (toWidth >= fromWidth && toHeight >= fromHeight) {
    // The tile is growing, which might be able to happen in-place
    const to = findNearestCell(
      gridWithoutTile,
      targetDest,
      (i) => {
        const end = areaEnd(i, toWidth, toHeight, g);
        return (
          column(i, g) + toWidth - 1 < g.columns &&
          inArea(from, i, end, g) &&
          inArea(fromEnd, i, end, g)
        );
      },
      (_c, i) => {
        const end = areaEnd(i, toWidth, toHeight, g);
        return end < newGridSize && canVacateArea(gridWithoutTile, i, end);
      },
    );

    if (to !== null) {
      const toEnd = areaEnd(to, toWidth, toHeight, g);
      const result = vacateArea(gridWithoutTile, to, toEnd);

      placeTile(to, toEnd, result);
      return result as G;
    }
  }

  // Catch-all path for when the tile is neither strictly shrinking nor
  // growing, or when there's not enough space for it to grow in-place

  const packedGridWithoutTile = fillGaps(gridWithoutTile, false);

  const to = findNearestCell(
    packedGridWithoutTile,
    targetDest,
    (i) => i < newGridSize && column(i, g) + toWidth - 1 < g.columns,
    (_c, i) => {
      const end = areaEnd(i, toWidth, toHeight, g);
      return end < newGridSize && canVacateArea(packedGridWithoutTile, i, end);
    },
  );

  if (to === null) return g; // There's no space anywhere; give up

  const toEnd = areaEnd(to, toWidth, toHeight, g);
  const result = vacateArea(packedGridWithoutTile, to, toEnd);

  placeTile(to, toEnd, result);
  return result as G;
}

/**
 * Resizes the grid to a new column width.
 */
export function resize(g: Grid, columns: number): Grid {
  const result: SparseGrid = { columns, cells: [] };
  const [largeColumns, largeRows] = largeTileDimensions(result);

  // Copy each tile from the old grid to the resized one in the same order

  // The next index in the result grid to copy a tile to
  let next = 0;

  for (const cell of g.cells) {
    if (cell.origin) {
      // TODO make aware of extra large tiles
      const [nextColumns, nextRows] = is1By1(cell)
        ? [1, 1]
        : [largeColumns, largeRows];

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
export function promoteSpeakers(g: SparseGrid): void {
  // This is all a bit of a hack right now, because we don't know if the designs
  // will stick with this approach in the long run
  // We assume that 4 rows are probably about 1 page
  const firstPageEnd = g.columns * 4;

  for (let from = firstPageEnd; from < g.cells.length; from++) {
    const fromCell = g.cells[from];
    // Don't bother trying to promote enlarged tiles
    if (fromCell?.item.isSpeaker && is1By1(fromCell)) {
      // Promote this tile by making 10 attempts to place it on the first page
      for (let j = 0; j < 10; j++) {
        const to = Math.floor(Math.random() * firstPageEnd);
        const toCell = g.cells[to];
        if (toCell === undefined || is1By1(toCell)) {
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
function updateTiles(g: Grid, tiles: TileDescriptor<unknown>[]): Grid {
  // Step 1: Update tiles that still exist, and remove tiles that have left
  // the grid
  const itemsById = new Map(tiles.map((i) => [i.id, i]));
  const grid1: SparseGrid = {
    ...g,
    cells: g.cells.map((c) => {
      if (c === undefined) return undefined;
      const item = itemsById.get(c.item.id);
      return item === undefined ? undefined : { ...c, item };
    }),
  };

  // Step 2: Add new tiles
  const existingItemIds = new Set(
    grid1.cells.filter((c) => c !== undefined).map((c) => c!.item.id),
  );
  const newItems = tiles.filter((i) => !existingItemIds.has(i.id));
  const grid2 = addItems(newItems, grid1);

  // Step 3: Promote speakers to the top
  promoteSpeakers(grid2);

  return fillGaps(grid2);
}

function updateBounds(g: Grid, bounds: RectReadOnly): Grid {
  const columns = Math.max(2, Math.floor(bounds.width * 0.0055));
  return columns === g.columns ? g : resize(g, columns);
}

const Slots: FC<{ s: Grid }> = memo(({ s: g }) => {
  const areas = new Array<(number | null)[]>(
    Math.ceil(g.cells.length / g.columns),
  );
  for (let i = 0; i < areas.length; i++)
    areas[i] = new Array<number | null>(g.columns).fill(null);

  let slotCount = 0;
  for (let i = 0; i < g.cells.length; i++) {
    const cell = g.cells[i];
    if (cell.origin) {
      const slotEnd = i + cell.columns - 1 + g.columns * (cell.rows - 1);
      forEachCellInArea(
        i,
        slotEnd,
        g,
        (_c, j) => (areas[row(j, g)][column(j, g)] = slotCount),
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
            .join(" ")}'`,
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
  g: SparseGrid,
  tileOriginIndex: number,
  xPositionOnTile: number,
  yPositionOnTile: number,
): number {
  const tileOrigin = g.cells[tileOriginIndex]!;
  const columnOnTile = Math.floor(xPositionOnTile * tileOrigin.columns);
  const rowOnTile = Math.floor(yPositionOnTile * tileOrigin.rows);
  return tileOriginIndex + columnOnTile + g.columns * rowOnTile;
}

function dragTile(
  g: Grid,
  from: TileDescriptor<unknown>,
  to: TileDescriptor<unknown>,
  xPositionOnFrom: number,
  yPositionOnFrom: number,
  xPositionOnTo: number,
  yPositionOnTo: number,
): Grid {
  const fromOrigin = g.cells.findIndex((c) => c.item === from);
  const toOrigin = g.cells.findIndex((c) => c.item === to);
  const fromCell = positionOnTileToCell(
    g,
    fromOrigin,
    xPositionOnFrom,
    yPositionOnFrom,
  );
  const toCell = positionOnTileToCell(
    g,
    toOrigin,
    xPositionOnTo,
    yPositionOnTo,
  );

  return moveTile(g, fromOrigin, fromOrigin + toCell - fromCell);
}

export const BigGrid: Layout<Grid> = {
  emptyState: { columns: 4, cells: [] },
  updateTiles,
  updateBounds,
  getTiles: <T,>(g: Grid) =>
    g.cells.filter((c) => c.origin).map((c) => c!.item as T),
  canDragTile: () => true,
  dragTile,
  toggleFocus: cycleTileSize,
  Slots,
  rememberState: false,
};
