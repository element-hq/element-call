import { useTransition } from "@react-spring/web";
import React, { FC, memo, ReactNode, useMemo, useRef } from "react";
import useMeasure from "react-use-measure";
import styles from "./NewVideoGrid.module.css";
import { TileDescriptor } from "./TileDescriptor";
import { VideoGridProps as Props } from "./VideoGrid";

interface Cell {
  /**
   * The item held by the slot containing this cell.
   */
  item: TileDescriptor
  /**
   * Whether this cell is the first cell of the containing slot.
   */
  slot: boolean
  /**
   * The width, in columns, of the containing slot.
   */
  columns: number
  /**
   * The height, in rows, of the containing slot.
   */
  rows: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Tile extends Rect {
  item: TileDescriptor
  dragging: boolean
}

interface SlotsProps {
  count: number
}

/**
 * Generates a number of empty slot divs.
 */
const Slots: FC<SlotsProps> = memo(({ count }) => {
  const slots = new Array<ReactNode>(count)
  for (let i = 0; i < count; i++) slots[i] = <div className={styles.slot} key={i} />
  return <>{slots}</>
})

export const NewVideoGrid: FC<Props> = ({ items, children }) => {
  const slotGridRef = useRef<HTMLDivElement>(null);
  const [gridRef, gridBounds] = useMeasure();

  const slotRects = useMemo(() => {
    if (slotGridRef.current === null) return [];

    const slots = slotGridRef.current.getElementsByClassName(styles.slot)
    const rects = new Array<Rect>(slots.length)
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i] as HTMLElement
      rects[i] = {
        x: slot.offsetLeft,
        y: slot.offsetTop,
        width: slot.offsetWidth,
        height: slot.offsetHeight,
      }
    }

    return rects;
  }, [items, gridBounds]);

  const cells: Cell[] = useMemo(() => items.map(item => ({
    item,
    slot: true,
    columns: 1,
    rows: 1,
  })), [items])

  const slotCells = useMemo(() => cells.filter(cell => cell.slot), [cells])

  const tiles: Tile[] = useMemo(() => slotRects.flatMap((slot, i) => {
    const cell = slotCells[i]
    if (cell === undefined) return []

    return [{
      item: cell.item,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      dragging: false,
    }]
  }), [slotRects, cells])

  const [tileTransitions] = useTransition(tiles, () => ({
    key: ({ item }: Tile) => item.id,
    from: { opacity: 0 },
    enter: ({ x, y, width, height }: Tile) => ({ opacity: 1, x, y, width, height }),
    update: ({ x, y, width, height }: Tile) => ({ x, y, width, height }),
    leave: { opacity: 0 },
  }), [tiles])

  const slotGridStyle = useMemo(() => {
    const columnCount = gridBounds.width >= 800 ? 6 : 3;
    return {
      gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
    };
  }, [gridBounds]);

  // Render nothing if the bounds are not yet known
  if (gridBounds.width === 0) {
    return <div ref={gridRef} className={styles.grid}>
      {/* It's important that we always attach slotGridRef to something,
      or else we may not receive the initial slot rects. */}
      <div ref={slotGridRef} className={styles.slotGrid} />
    </div>
  }

  return (
    <div
      ref={gridRef}
      className={styles.grid}
    >
      <div style={slotGridStyle} ref={slotGridRef} className={styles.slotGrid}>
        <Slots count={items.length} />
      </div>
      {tileTransitions((style, tile) => children({
        key: tile.item.id,
        style: style as any,
        width: tile.width,
        height: tile.height,
        item: tile.item,
      }))}
    </div>
  );
};
