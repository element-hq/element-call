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
import { TileDescriptor } from "./TileDescriptor";

/**
 * A 1×1 cell in a grid which belongs to a tile.
 */
export interface Cell {
  /**
   * The item displayed on the tile.
   */
  item: TileDescriptor;
  /**
   * Whether this cell is the origin (top left corner) of the tile.
   */
  origin: boolean;
  /**
   * The width, in columns, of the tile.
   */
  columns: number;
  /**
   * The height, in rows, of the tile.
   */
  rows: number;
}

export interface Grid {
  columns: number;
  /**
   * The cells of the grid, in left-to-right top-to-bottom order.
   * undefined = empty.
   */
  cells: (Cell | undefined)[];
}

export function dijkstra(g: Grid): number[] {
  const end = findLast1By1Index(g) ?? 0;
  const endRow = row(end, g);
  const endColumn = column(end, g);

  const distances = new Array<number>(end + 1).fill(Infinity);
  distances[end] = 0;
  const edges = new Array<number | undefined>(end).fill(undefined);
  const heap = new TinyQueue([end], (i) => distances[i]);

  const visit = (curr: number, via: number) => {
    const viaCell = g.cells[via];
    const viaLargeTile =
      viaCell !== undefined && (viaCell.rows > 1 || viaCell.columns > 1);
    const distanceVia = distances[via] + (viaLargeTile ? 4 : 1);

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

    if (viaRow > 0) visit(via - g.columns, via);
    if (viaColumn > 0) visit(via - 1, via);
    if (viaColumn < (viaRow === endRow ? endColumn : g.columns - 1))
      visit(via + 1, via);
    if (
      viaRow < endRow - 1 ||
      (viaRow === endRow - 1 && viaColumn <= endColumn)
    )
      visit(via + g.columns, via);
  }

  return edges as number[];
}

function findLastIndex<T>(
  array: T[],
  predicate: (item: T) => boolean
): number | null {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) return i;
  }

  return null;
}

const findLast1By1Index = (g: Grid): number | null =>
  findLastIndex(g.cells, (c) => c?.rows === 1 && c?.columns === 1);

export function row(index: number, g: Grid): number {
  return Math.floor(index / g.columns);
}

export function column(index: number, g: Grid): number {
  return ((index % g.columns) + g.columns) % g.columns;
}

function inArea(index: number, start: number, end: number, g: Grid): boolean {
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
  g: Grid
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
  g: Grid,
  fn: (c: Cell | undefined, i: number) => void
): void {
  for (const i of cellsInArea(start, end, g)) fn(g.cells[i], i);
}

function allCellsInArea(
  start: number,
  end: number,
  g: Grid,
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
  g: Grid
): number => start + columns - 1 + g.columns * (rows - 1);

/**
 * Gets the index of the next gap in the grid that should be backfilled by 1×1
 * tiles.
 */
function getNextGap(g: Grid): number | null {
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

export function fillGaps(g: Grid): Grid {
  const result: Grid = { ...g, cells: [...g.cells] };
  let gap = getNextGap(result);

  if (gap !== null) {
    const pathToEnd = dijkstra(result);

    do {
      let filled = false;
      let to = gap;
      let from: number | undefined = pathToEnd[gap];

      // First, attempt to fill the gap by moving 1×1 tiles backwards from the
      // end of the grid along a set path
      while (from !== undefined) {
        const toCell = result.cells[to];
        const fromCell = result.cells[from];

        // Skip over large tiles
        if (toCell !== undefined) {
          to = pathToEnd[to];
          // Skip over large tiles. Also, we might run into gaps along the path
          // created during the filling of previous gaps. Skip over those too;
          // they'll be picked up on the next iteration of the outer loop.
        } else if (
          fromCell === undefined ||
          fromCell.rows > 1 ||
          fromCell.columns > 1
        ) {
          from = pathToEnd[from];
        } else {
          result.cells[to] = result.cells[from];
          result.cells[from] = undefined;
          filled = true;
          to = pathToEnd[to];
          from = pathToEnd[from];
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

  // TODO: If there are any large tiles on the last row, shuffle them back
  // upwards into a full row

  // Shrink the array to remove trailing gaps
  const finalLength =
    (findLastIndex(result.cells, (c) => c !== undefined) ?? -1) + 1;
  if (finalLength < result.cells.length)
    result.cells = result.cells.slice(0, finalLength);

  return result;
}

export function appendItems(items: TileDescriptor[], g: Grid): Grid {
  return {
    ...g,
    cells: [
      ...g.cells,
      ...items.map((i) => ({
        item: i,
        origin: true,
        columns: 1,
        rows: 1,
      })),
    ],
  };
}

export function cycleTileSize(tileId: string, g: Grid): Grid {
  const from = g.cells.findIndex((c) => c?.item.id === tileId);
  if (from === -1) return g; // Tile removed, no change
  const fromWidth = g.cells[from]!.columns;
  const fromHeight = g.cells[from]!.rows;
  const fromEnd = areaEnd(from, fromWidth, fromHeight, g);

  const [toWidth, toHeight] =
    fromWidth === 1 && fromHeight === 1
      ? [Math.min(3, Math.max(2, g.columns - 1)), 2]
      : [1, 1];
  const newRows = Math.max(
    0,
    Math.ceil((toWidth * toHeight - fromWidth * fromHeight) / g.columns)
  );

  const candidateWidth = toWidth;
  const candidateHeight = toHeight - newRows;

  const gappyGrid: Grid = {
    ...g,
    cells: new Array(g.cells.length + newRows * g.columns),
  };

  const nextScanLocations = new Set<number>([from]);
  const scanColumnOffset = Math.floor((toWidth - 1) / 2);
  const scanRowOffset = Math.floor((toHeight - 1) / 2);
  const rows = row(g.cells.length - 1, g) + 1;
  let to: number | null = null;

  const displaceable = (c: Cell | undefined, i: number): boolean =>
    c === undefined ||
    (c.columns === 1 && c.rows === 1) ||
    inArea(i, from, fromEnd, g);

  for (const scanLocation of nextScanLocations) {
    const start = scanLocation - scanColumnOffset - g.columns * scanRowOffset;
    const end = areaEnd(start, candidateWidth, candidateHeight, g);
    const startColumn = column(start, g);
    const startRow = row(start, g);
    const endColumn = column(end, g);

    if (
      start >= 0 &&
      end < gappyGrid.cells.length &&
      endColumn - startColumn + 1 === candidateWidth
    ) {
      if (allCellsInArea(start, end, g, displaceable)) {
        to = start;
        break;
      }
    }

    if (startColumn > 0) nextScanLocations.add(scanLocation - 1);
    if (endColumn < g.columns - 1) nextScanLocations.add(scanLocation + 1);
    if (startRow > 0) nextScanLocations.add(scanLocation - g.columns);
    if (startRow <= rows) nextScanLocations.add(scanLocation + g.columns);
  }

  // TODO: Don't give up on placing the tile yet
  if (to === null) return g;

  const toRow = row(to, g);

  g.cells.forEach((c, src) => {
    if (c?.origin && c.item.id !== tileId) {
      const offset =
        row(src, g) > toRow + candidateHeight - 1 ? g.columns * newRows : 0;
      forEachCellInArea(src, areaEnd(src, c.columns, c.rows, g), g, (c, i) => {
        gappyGrid.cells[i + offset] = c;
      });
    }
  });

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

  for (let i = 0; displacedTiles.length > 0; i++) {
    if (gappyGrid.cells[i] === undefined)
      gappyGrid.cells[i] = displacedTiles.shift();
  }

  return fillGaps(gappyGrid);
}
