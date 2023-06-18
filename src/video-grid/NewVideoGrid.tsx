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

import { SpringRef, TransitionFn, useTransition } from "@react-spring/web";
import { EventTypes, Handler, useScroll } from "@use-gesture/react";
import React, {
  Dispatch,
  FC,
  ReactNode,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useMeasure from "react-use-measure";
import { zipWith } from "lodash";

import styles from "./NewVideoGrid.module.css";
import { TileDescriptor } from "./TileDescriptor";
import { VideoGridProps as Props, TileSpring } from "./VideoGrid";
import { useReactiveState } from "../useReactiveState";
import { useMergedRefs } from "../useMergedRefs";
import {
  Grid,
  Cell,
  row,
  column,
  fillGaps,
  forEachCellInArea,
  cycleTileSize,
  addItems,
  tryMoveTile,
  resize,
  promoteSpeakers,
} from "./model";
import { TileWrapper } from "./TileWrapper";

interface GridState extends Grid {
  /**
   * The ID of the current state of the grid.
   */
  generation: number;
}

const useGridState = (
  columns: number | null,
  items: TileDescriptor[]
): [GridState | null, Dispatch<SetStateAction<Grid>>] => {
  const [grid, setGrid_] = useReactiveState<GridState | null>(
    (prevGrid = null) => {
      if (prevGrid === null) {
        // We can't do anything if the column count isn't known yet
        if (columns === null) {
          return null;
        } else {
          prevGrid = { generation: 0, columns, cells: [] };
        }
      }

      // Step 1: Update tiles that still exist, and remove tiles that have left
      // the grid
      const itemsById = new Map(items.map((i) => [i.id, i]));
      const grid1: Grid = {
        ...prevGrid,
        cells: prevGrid.cells.map((c) => {
          if (c === undefined) return undefined;
          const item = itemsById.get(c.item.id);
          return item === undefined ? undefined : { ...c, item };
        }),
      };

      // Step 2: Resize the grid if necessary and backfill gaps left behind by
      // removed tiles
      // Resizing already takes care of backfilling gaps
      const grid2 =
        columns !== grid1.columns ? resize(grid1, columns!) : fillGaps(grid1);

      // Step 3: Add new tiles to the end of the grid
      const existingItemIds = new Set(
        grid2.cells.filter((c) => c !== undefined).map((c) => c!.item.id)
      );
      const newItems = items.filter((i) => !existingItemIds.has(i.id));
      const grid3 = addItems(newItems, grid2);

      // Step 4: Promote speakers to the top
      promoteSpeakers(grid3);

      return { ...grid3, generation: prevGrid.generation + 1 };
    },
    [columns, items]
  );

  const setGrid: Dispatch<SetStateAction<Grid>> = useCallback(
    (action) => {
      if (typeof action === "function") {
        setGrid_((prevGrid) =>
          prevGrid === null
            ? null
            : {
                ...(action as (prev: Grid) => Grid)(prevGrid),
                generation: prevGrid.generation + 1,
              }
        );
      } else {
        setGrid_((prevGrid) => ({
          ...action,
          generation: prevGrid?.generation ?? 1,
        }));
      }
    },
    [setGrid_]
  );

  return [grid, setGrid];
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Tile extends Rect {
  item: TileDescriptor;
}

interface DragState {
  tileId: string;
  tileX: number;
  tileY: number;
  cursorX: number;
  cursorY: number;
}

/**
 * An interactive, animated grid of video tiles.
 */
export const NewVideoGrid: FC<Props> = ({
  items,
  disableAnimations,
  children,
}) => {
  // Overview: This component lays out tiles by rendering an invisible template
  // grid of "slots" for tiles to go in. Once rendered, it uses the DOM API to
  // get the dimensions of each slot, feeding these numbers back into
  // react-spring to let the actual tiles move freely atop the template.

  // To know when the rendered grid becomes consistent with the layout we've
  // requested, we give it a data-generation attribute which holds the ID of the
  // most recently rendered generation of the grid, and watch it with a
  // MutationObserver.

  const [slotGrid, setSlotGrid] = useState<HTMLDivElement | null>(null);
  const [slotGridGeneration, setSlotGridGeneration] = useState(0);

  useEffect(() => {
    if (slotGrid !== null) {
      setSlotGridGeneration(
        parseInt(slotGrid.getAttribute("data-generation")!)
      );

      const observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "attributes")) {
          setSlotGridGeneration(
            parseInt(slotGrid.getAttribute("data-generation")!)
          );
        }
      });

      observer.observe(slotGrid, { attributes: true });
      return () => observer.disconnect();
    }
  }, [slotGrid, setSlotGridGeneration]);

  const [gridRef1, gridBounds] = useMeasure();
  const gridRef2 = useRef<HTMLDivElement | null>(null);
  const gridRef = useMergedRefs(gridRef1, gridRef2);

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
    // The rects may change due to the grid being resized or rerendered, but
    // eslint can't statically verify this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotGrid, slotGridGeneration, gridBounds]);

  const columns = useMemo(
    () =>
      // The grid bounds might not be known yet
      gridBounds.width === 0
        ? null
        : Math.max(2, Math.floor(gridBounds.width * 0.0045)),
    [gridBounds]
  );

  const [grid, setGrid] = useGridState(columns, items);

  const [tiles] = useReactiveState<Tile[]>(
    (prevTiles) => {
      // If React hasn't yet rendered the current generation of the grid, skip
      // the update, because grid and slotRects will be out of sync
      if (slotGridGeneration !== grid?.generation) return prevTiles ?? [];

      const tileCells = grid.cells.filter((c) => c?.origin) as Cell[];
      const tileRects = new Map<TileDescriptor, Rect>(
        zipWith(tileCells, slotRects, (cell, rect) => [cell.item, rect])
      );
      return items.map((item) => ({ ...tileRects.get(item)!, item }));
    },
    [slotRects, grid, slotGridGeneration]
  );

  // Drag state is stored in a ref rather than component state, because we use
  // react-spring's imperative API during gestures to improve responsiveness
  const dragState = useRef<DragState | null>(null);

  const [tileTransitions, springRef] = useTransition(
    tiles,
    () => ({
      key: ({ item }: Tile) => item.id,
      from: ({ x, y, width, height }: Tile) => ({
        opacity: 0,
        scale: 0,
        shadow: 1,
        shadowSpread: 0,
        zIndex: 1,
        x,
        y,
        width,
        height,
        immediate: disableAnimations,
      }),
      enter: { opacity: 1, scale: 1, immediate: disableAnimations },
      update: ({ item, x, y, width, height }: Tile) =>
        item.id === dragState.current?.tileId
          ? null
          : {
              x,
              y,
              width,
              height,
              immediate: disableAnimations,
            },
      leave: { opacity: 0, scale: 0, immediate: disableAnimations },
      config: { mass: 0.7, tension: 252, friction: 25 },
    })
    // react-spring's types are bugged and can't infer the spring type
  ) as unknown as [TransitionFn<Tile, TileSpring>, SpringRef<TileSpring>];

  // Because we're using react-spring in imperative mode, we're responsible for
  // firing animations manually whenever the tiles array updates
  useEffect(() => {
    springRef.start();
  }, [tiles, springRef]);

  const animateDraggedTile = (endOfGesture: boolean) => {
    const { tileId, tileX, tileY, cursorX, cursorY } = dragState.current!;
    const tile = tiles.find((t) => t.item.id === tileId)!;
    const originIndex = grid!.cells.findIndex((c) => c?.item.id === tileId);
    const originCell = grid!.cells[originIndex]!;

    springRef.current
      .find((c) => (c.item as Tile).item.id === tileId)
      ?.start(
        endOfGesture
          ? {
              scale: 1,
              zIndex: 1,
              shadow: 1,
              x: tile.x,
              y: tile.y,
              width: tile.width,
              height: tile.height,
              immediate: disableAnimations || ((key) => key === "zIndex"),
              // Allow the tile's position to settle before pushing its
              // z-index back down
              delay: (key) => (key === "zIndex" ? 500 : 0),
            }
          : {
              scale: 1.1,
              zIndex: 2,
              shadow: 15,
              x: tileX,
              y: tileY,
              immediate:
                disableAnimations ||
                ((key) => key === "zIndex" || key === "x" || key === "y"),
            }
      );

    const columns = grid!.columns;
    const rows = row(grid!.cells.length - 1, grid!) + 1;

    const cursorColumn = Math.floor(
      (cursorX / slotGrid!.clientWidth) * columns
    );
    const cursorRow = Math.floor((cursorY / slotGrid!.clientHeight) * rows);

    const cursorColumnOnTile = Math.floor(
      ((cursorX - tileX) / tile.width) * originCell.columns
    );
    const cursorRowOnTile = Math.floor(
      ((cursorY - tileY) / tile.height) * originCell.rows
    );

    const dest =
      Math.max(
        0,
        Math.min(
          columns - originCell.columns,
          cursorColumn - cursorColumnOnTile
        )
      ) +
      grid!.columns *
        Math.max(
          0,
          Math.min(rows - originCell.rows, cursorRow - cursorRowOnTile)
        );

    if (dest !== originIndex) setGrid((g) => tryMoveTile(g, originIndex, dest));
  };

  // Callback for useDrag. We could call useDrag here, but the default
  // pattern of spreading {...bind()} across the children to bind the gesture
  // ends up breaking memoization and ruining this component's performance.
  // Instead, we pass this callback to each tile via a ref, to let them bind the
  // gesture using the much more sensible ref-based method.
  const onTileDrag = (
    tileId: string,
    {
      tap,
      initial: [initialX, initialY],
      delta: [dx, dy],
      last,
    }: Parameters<Handler<"drag", EventTypes["drag"]>>[0]
  ) => {
    if (tap) {
      setGrid((g) => cycleTileSize(tileId, g!));
    } else {
      const tileSpring = springRef.current
        .find((c) => (c.item as Tile).item.id === tileId)!
        .get();

      if (dragState.current === null) {
        dragState.current = {
          tileId,
          tileX: tileSpring.x,
          tileY: tileSpring.y,
          cursorX: initialX - gridBounds.x,
          cursorY: initialY - gridBounds.y + scrollOffset.current,
        };
      }
      dragState.current.tileX += dx;
      dragState.current.tileY += dy;
      dragState.current.cursorX += dx;
      dragState.current.cursorY += dy;

      animateDraggedTile(last);

      if (last) dragState.current = null;
    }
  };

  const onTileDragRef = useRef(onTileDrag);
  onTileDragRef.current = onTileDrag;

  const scrollOffset = useRef(0);

  useScroll(
    ({ xy: [, y], delta: [, dy] }) => {
      scrollOffset.current = y;

      if (dragState.current !== null) {
        dragState.current.tileY += dy;
        dragState.current.cursorY += dy;
        animateDraggedTile(false);
      }
    },
    { target: gridRef2 }
  );

  const slotGridStyle = useMemo(() => {
    if (grid === null) return {};

    const areas = new Array<(number | null)[]>(
      Math.ceil(grid.cells.length / grid.columns)
    );
    for (let i = 0; i < areas.length; i++)
      areas[i] = new Array<number | null>(grid.columns).fill(null);

    let slotId = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      const cell = grid.cells[i];
      if (cell?.origin) {
        const slotEnd = i + cell.columns - 1 + grid.columns * (cell.rows - 1);
        forEachCellInArea(
          i,
          slotEnd,
          grid,
          (_c, j) => (areas[row(j, grid)][column(j, grid)] = slotId)
        );
        slotId++;
      }
    }

    return {
      gridTemplateAreas: areas
        .map(
          (row) =>
            `'${row
              .map((slotId) => (slotId === null ? "." : `s${slotId}`))
              .join(" ")}'`
        )
        .join(" "),
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
    };
  }, [grid, columns]);

  const slots = useMemo(() => {
    const slots = new Array<ReactNode>(items.length);
    for (let i = 0; i < items.length; i++)
      slots[i] = (
        <div className={styles.slot} key={i} style={{ gridArea: `s${i}` }} />
      );
    return slots;
  }, [items.length]);

  // Render nothing if the grid has yet to be generated
  if (grid === null) {
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
        {slots}
      </div>
      {tileTransitions((spring, tile) => (
        <TileWrapper
          key={tile.item.id}
          id={tile.item.id}
          onDragRef={onTileDragRef}
          targetWidth={tile.width}
          targetHeight={tile.height}
          item={tile.item}
          {...spring}
        >
          {children}
        </TileWrapper>
      ))}
    </div>
  );
};
