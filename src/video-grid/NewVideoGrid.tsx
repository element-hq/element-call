import { useTransition } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import React, {
  FC,
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import useMeasure from "react-use-measure";
import styles from "./NewVideoGrid.module.css";
import { TileDescriptor } from "./TileDescriptor";
import { VideoGridProps as Props } from "./VideoGrid";
import { useReactiveState } from "../useReactiveState";
import TinyQueue from "tinyqueue";
import { zipWith } from "lodash";

interface Cell {
  /**
   * The item held by the slot containing this cell.
   */
  item: TileDescriptor;
  /**
   * Whether this cell is the first cell of the containing slot.
   */
  slot: boolean;
  /**
   * The width, in columns, of the containing slot.
   */
  columns: number;
  /**
   * The height, in rows, of the containing slot.
   */
  rows: number;
}

interface Grid {
  generation: number;
  columns: number;
  cells: (Cell | undefined)[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Tile extends Rect {
  item: TileDescriptor;
}

interface TileSpring {
  opacity: number;
  scale: number;
  shadow: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const dijkstra = (g: Grid): number[] => {
  const end = findLast1By1Index(g) ?? 0;
  const endRow = row(end, g);
  const endColumn = column(end, g);

  const distances = new Array<number>(end + 1).fill(Infinity);
  distances[end] = 0;
  const edges = new Array<number | undefined>(end).fill(undefined);
  const heap = new TinyQueue([end], (i) => distances[i]);

  const visit = (curr: number, via: number) => {
    const viaCell = g.cells[via];
    const viaLargeSlot =
      viaCell !== undefined && (viaCell.rows > 1 || viaCell.columns > 1);
    const distanceVia = distances[via] + (viaLargeSlot ? 4 : 1);

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
};

const findLastIndex = <T,>(
  array: T[],
  predicate: (item: T) => boolean
): number | null => {
  for (let i = array.length - 1; i > 0; i--) {
    if (predicate(array[i])) return i;
  }

  return null;
};

const findLast1By1Index = (g: Grid): number | null =>
  findLastIndex(g.cells, (c) => c?.rows === 1 && c?.columns === 1);

const row = (index: number, g: Grid): number => Math.floor(index / g.columns);
const column = (index: number, g: Grid): number => index % g.columns;

/**
 * Gets the index of the next gap in the grid that should be backfilled by 1×1
 * tiles.
 */
const getNextGap = (g: Grid): number | null => {
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
};

const fillGaps = (g: Grid): Grid => {
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
};

interface SlotsProps {
  count: number;
}

/**
 * Generates a number of empty slot divs.
 */
const Slots: FC<SlotsProps> = memo(({ count }) => {
  const slots = new Array<ReactNode>(count);
  for (let i = 0; i < count; i++)
    slots[i] = <div className={styles.slot} key={i} />;
  return <>{slots}</>;
});

export const NewVideoGrid: FC<Props> = ({
  items,
  disableAnimations,
  children,
}) => {
  const [slotGrid, setSlotGrid] = useState<HTMLDivElement | null>(null);
  const [slotGridGeneration, setSlotGridGeneration] = useState(0)
  const [gridRef, gridBounds] = useMeasure();

  useEffect(() => {
    if (slotGrid !== null) {
      setSlotGridGeneration(parseInt(slotGrid.getAttribute("data-generation")!))

      const observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.type === "attributes")) {
          setSlotGridGeneration(parseInt(slotGrid.getAttribute("data-generation")!))
        }
      })

      observer.observe(slotGrid, { attributes: true })
      return () => observer.disconnect()
    }
  }, [slotGrid, setSlotGridGeneration])

  const slotRects = useMemo(() => {
    if (slotGrid === null) return [];

    const slots = slotGrid.getElementsByClassName(styles.slot);
    const rects = new Array<Rect>(slots.length);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i] as HTMLElement;
      rects[i] = {
        x: slot.offsetLeft,
        y: slot.offsetTop,
        width: slot.offsetWidth,
        height: slot.offsetHeight,
      };
    }

    return rects;
  }, [items, slotGridGeneration, slotGrid]);

  const [grid, setGrid] = useReactiveState<Grid>(
    (prevGrid = { generation: 0, columns: 6, cells: [] }) => {
      // Step 1: Update tiles that still exist, and remove tiles that have left
      // the grid
      const itemsById = new Map(items.map((i) => [i.id, i]));
      const grid1: Grid = {
        ...prevGrid,
        generation: prevGrid.generation + 1,
        cells: prevGrid.cells.map((c) => {
          if (c === undefined) return undefined;
          const item = itemsById.get(c.item.id);
          return item === undefined ? undefined : { ...c, item };
        }),
      };

      // Step 2: Backfill gaps left behind by removed tiles
      const grid2 = fillGaps(grid1);

      // Step 3: Add new tiles to the end of the grid
      const existingItemIds = new Set(
        grid2.cells.filter((c) => c !== undefined).map((c) => c!.item.id)
      );
      const newItems = items.filter((i) => !existingItemIds.has(i.id));
      const grid3: Grid = {
        ...grid2,
        cells: [
          ...grid2.cells,
          ...newItems.map((i) => ({
            item: i,
            slot: true,
            columns: 1,
            rows: 1,
          })),
        ],
      };

      return grid3;
    },
    [items]
  );

  const [tiles] = useReactiveState<Tile[]>(
    (prevTiles) => {
      // If React hasn't yet rendered the current generation of the layout, skip
      // the update, because grid and slotRects will be out of sync
      if (slotGridGeneration !== grid.generation) return prevTiles ?? [];

      const slotCells = grid.cells.filter((c) => c?.slot) as Cell[];
      console.log(slotGridGeneration, grid.generation, slotCells.length, slotRects.length, slotGrid?.getElementsByClassName(styles.slot).length)
      return zipWith(slotCells, slotRects, (cell, rect) => ({
        item: cell.item,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }));
    },
    [slotRects, grid, slotGridGeneration]
  );

  const [tileTransitions] = useTransition(
    tiles,
    () => ({
      key: ({ item }: Tile) => item.id,
      from: (({ x, y, width, height }: Tile) => ({
        opacity: 0,
        scale: 0,
        shadow: 1,
        x,
        y,
        width,
        height,
        // react-spring's types are bugged and need this to be a function with no
        // parameters to infer the spring type
      })) as unknown as () => TileSpring,
      enter: { opacity: 1, scale: 1 },
      update: ({ x, y, width, height }: Tile) => ({ x, y, width, height }),
      leave: { opacity: 0, scale: 0 },
      immediate: (key: string) =>
        disableAnimations || key === "zIndex" || key === "shadow",
      // If we just stopped dragging a tile, give it time for the
      // animation to settle before pushing its z-index back down
      delay: (key: string) => (key === "zIndex" ? 500 : 0),
    }),
    [tiles, disableAnimations]
  );

  const slotGridStyle = useMemo(() => {
    const columnCount = gridBounds.width >= 800 ? 6 : 3;
    return {
      gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
    };
  }, [gridBounds]);

  const bindTile = useDrag(
    useCallback(({ event, tap }) => {
      event.preventDefault();

      if (tap) {
        // TODO: When enlarging tiles, add the minimum number of rows required
        // to not need to force any tiles towards the end, find the right number
        // of consecutive spots for a tile of size w * (h - added rows),
        // displace overlapping tiles, and then backfill.
        // When unenlarging tiles, consider doing that in reverse (deleting
        // rows and displacing tiles. pushing tiles outwards might be necessary)
      }
    }, []),
    { filterTaps: true, pointer: { buttons: [1] } }
  );

  // Render nothing if the bounds are not yet known
  if (gridBounds.width === 0) {
    return <div ref={gridRef} className={styles.grid} />;
  }

  return (
    <div ref={gridRef} className={styles.grid}>
      <div
        style={slotGridStyle}
        ref={setSlotGrid}
        className={styles.slotGrid}
        data-generation={grid.generation}
      >
        <Slots count={items.length} />
      </div>
      {tileTransitions(({ shadow, ...style }, tile) =>
        children({
          ...bindTile(tile.item.id),
          key: tile.item.id,
          style: {
            boxShadow: shadow.to(
              (s) => `rgba(0, 0, 0, 0.5) 0px ${s}px ${2 * s}px 0px`
            ),
            ...style,
          },
          width: tile.width,
          height: tile.height,
          item: tile.item,
        })
      )}
    </div>
  );
};
