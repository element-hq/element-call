import { useTransition } from "@react-spring/web";
import React, { FC, memo, ReactNode, useMemo, useState } from "react";
import useMeasure from "react-use-measure";

import styles from "./NewVideoGrid.module.css";
import { TileDescriptor } from "./TileDescriptor";
import { VideoGridProps as Props } from "./VideoGrid";

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

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Tile extends Rect {
  item: TileDescriptor;
}

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
  const [gridRef, gridBounds] = useMeasure();

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
  }, [slotGrid]);

  const cells: Cell[] = useMemo(
    () =>
      items.map((item) => ({
        item,
        slot: true,
        columns: 1,
        rows: 1,
      })),
    [items]
  );

  const slotCells = useMemo(() => cells.filter((cell) => cell.slot), [cells]);

  const tiles: Tile[] = useMemo(
    () =>
      slotRects.flatMap((slot, i) => {
        const cell = slotCells[i];
        if (cell === undefined) return [];

        return [
          {
            item: cell.item,
            x: slot.x,
            y: slot.y,
            width: slot.width,
            height: slot.height,
          },
        ];
      }),
    [slotRects, slotCells]
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
      })) as unknown as () => {
        opacity: number;
        scale: number;
        shadow: number;
        x: number;
        y: number;
        width: number;
        height: number;
      },
      enter: { opacity: 1, scale: 1 },
      update: ({ x, y, width, height }: Tile) => ({ x, y, width, height }),
      leave: { opacity: 0, scale: 0 },
      immediate: (key: string) =>
        disableAnimations || key === "zIndex" || key === "shadow",
      // If we just stopped dragging a tile, give it time for the
      // animation to settle before pushing its z-index back down
      delay: (key: string) => (key === "zIndex" ? 500 : 0),
      trail: 20,
    }),
    [tiles, disableAnimations]
  );

  const slotGridStyle = useMemo(() => {
    const columnCount = gridBounds.width >= 800 ? 6 : 3;
    return {
      gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
    };
  }, [gridBounds]);

  // Render nothing if the bounds are not yet known
  if (gridBounds.width === 0) {
    return <div ref={gridRef} className={styles.grid} />;
  }

  return (
    <div ref={gridRef} className={styles.grid}>
      <div style={slotGridStyle} ref={setSlotGrid} className={styles.slotGrid}>
        <Slots count={items.length} />
      </div>
      {tileTransitions(({ shadow, ...style }, tile) =>
        children({
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
