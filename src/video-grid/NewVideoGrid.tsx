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
import {
  CSSProperties,
  FC,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useMeasure from "react-use-measure";
import { zip } from "lodash";

import styles from "./NewVideoGrid.module.css";
import {
  VideoGridProps as Props,
  TileSpring,
  ChildrenProperties,
  TileSpringUpdate,
} from "./VideoGrid";
import { useReactiveState } from "../useReactiveState";
import { useMergedRefs } from "../useMergedRefs";
import { TileWrapper } from "./TileWrapper";
import { BigGrid } from "./BigGrid";
import { useLayout } from "./Layout";
import { TileDescriptor } from "../state/CallViewModel";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Tile<T> extends Rect {
  item: TileDescriptor<T>;
}

interface DragState {
  tileId: string;
  tileX: number;
  tileY: number;
  cursorX: number;
  cursorY: number;
}

interface TapData {
  tileId: string;
  ts: number;
}

interface SlotProps {
  style?: CSSProperties;
}

export const Slot: FC<SlotProps> = ({ style }) => (
  <div className={styles.slot} style={style} />
);

/**
 * An interactive, animated grid of video tiles.
 */
export function NewVideoGrid<T>({
  items,
  disableAnimations,
  layoutStates,
  children,
}: Props<T>): ReactNode {
  // Overview: This component lays out tiles by rendering an invisible template
  // grid of "slots" for tiles to go in. Once rendered, it uses the DOM API to
  // get the dimensions of each slot, feeding these numbers back into
  // react-spring to let the actual tiles move freely atop the template.

  // To know when the rendered grid becomes consistent with the layout we've
  // requested, we give it a data-generation attribute which holds the ID of the
  // most recently rendered generation of the grid, and watch it with a
  // MutationObserver.

  const [slotsRoot, setSlotsRoot] = useState<HTMLDivElement | null>(null);
  const [renderedGeneration, setRenderedGeneration] = useState(0);

  useEffect(() => {
    if (slotsRoot !== null) {
      setRenderedGeneration(
        parseInt(slotsRoot.getAttribute("data-generation")!),
      );

      const observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "attributes")) {
          setRenderedGeneration(
            parseInt(slotsRoot.getAttribute("data-generation")!),
          );
        }
      });

      observer.observe(slotsRoot, { attributes: true });
      return (): void => observer.disconnect();
    }
  }, [slotsRoot, setRenderedGeneration]);

  const [gridRef1, gridBounds] = useMeasure();
  const gridRef2 = useRef<HTMLDivElement | null>(null);
  const gridRef = useMergedRefs(gridRef1, gridRef2);

  const slotRects = useMemo(() => {
    if (slotsRoot === null) return [];

    const slots = slotsRoot.getElementsByClassName(styles.slot);
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
  }, [slotsRoot, renderedGeneration, gridBounds]);

  // TODO: Implement more layouts and select the right one here
  const layout = BigGrid;
  const {
    state: grid,
    orderedItems,
    generation,
    canDragTile,
    dragTile,
    toggleFocus,
    slots,
  } = useLayout(layout, items, gridBounds, layoutStates);

  const [tiles] = useReactiveState<Tile<T>[]>(
    (prevTiles) => {
      // If React hasn't yet rendered the current generation of the grid, skip
      // the update, because grid and slotRects will be out of sync
      if (renderedGeneration !== generation) return prevTiles ?? [];

      const tileRects = new Map(
        zip(orderedItems, slotRects) as [TileDescriptor<T>, Rect][],
      );
      // In order to not break drag gestures, it's critical that we render tiles
      // in a stable order (that of 'items')
      return items.map((item) => ({ ...tileRects.get(item)!, item }));
    },
    [slotRects, grid, renderedGeneration],
  );

  // Drag state is stored in a ref rather than component state, because we use
  // react-spring's imperative API during gestures to improve responsiveness
  const dragState = useRef<DragState | null>(null);

  const [tileTransitions, springRef] = useTransition(
    tiles,
    () => ({
      key: ({ item }: Tile<T>): string => item.id,
      from: ({ x, y, width, height }: Tile<T>): TileSpringUpdate => ({
        opacity: 0,
        scale: 0,
        shadow: 0,
        shadowSpread: 0,
        zIndex: 1,
        x,
        y,
        width,
        height,
        immediate: disableAnimations,
      }),
      enter: { opacity: 1, scale: 1, immediate: disableAnimations },
      update: ({
        item,
        x,
        y,
        width,
        height,
      }: Tile<T>): TileSpringUpdate | null =>
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
    }),
    // react-spring's types are bugged and can't infer the spring type
  ) as unknown as [TransitionFn<Tile<T>, TileSpring>, SpringRef<TileSpring>];

  // Because we're using react-spring in imperative mode, we're responsible for
  // firing animations manually whenever the tiles array updates
  useEffect(() => {
    springRef.start();
  }, [tiles, springRef]);

  const animateDraggedTile = (endOfGesture: boolean): void => {
    const { tileId, tileX, tileY, cursorX, cursorY } = dragState.current!;
    const tile = tiles.find((t) => t.item.id === tileId)!;

    springRef.current
      .find((c) => (c.item as Tile<T>).item.id === tileId)
      ?.start(
        endOfGesture
          ? {
              scale: 1,
              zIndex: 1,
              shadow: 0,
              x: tile.x,
              y: tile.y,
              width: tile.width,
              height: tile.height,
              immediate:
                disableAnimations || ((key): boolean => key === "zIndex"),
              // Allow the tile's position to settle before pushing its
              // z-index back down
              delay: (key): number => (key === "zIndex" ? 500 : 0),
            }
          : {
              scale: 1.1,
              zIndex: 2,
              shadow: 15,
              x: tileX,
              y: tileY,
              immediate:
                disableAnimations ||
                ((key): boolean =>
                  key === "zIndex" || key === "x" || key === "y"),
            },
      );

    const overTile = tiles.find(
      (t) =>
        cursorX >= t.x &&
        cursorX < t.x + t.width &&
        cursorY >= t.y &&
        cursorY < t.y + t.height,
    );

    if (overTile !== undefined)
      dragTile(
        tile.item,
        overTile.item,
        (cursorX - tileX) / tile.width,
        (cursorY - tileY) / tile.height,
        (cursorX - overTile.x) / overTile.width,
        (cursorY - overTile.y) / overTile.height,
      );
  };

  const lastTap = useRef<TapData | null>(null);

  // Callback for useDrag. We could call useDrag here, but the default
  // pattern of spreading {...bind()} across the children to bind the gesture
  // ends up breaking memoization and ruining this component's performance.
  // Instead, we pass this callback to each tile via a ref, to let them bind the
  // gesture using the much more sensible ref-based method.
  const onTileDrag = (
    tileId: string,

    {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      tap,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      initial: [initialX, initialY],
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delta: [dx, dy],
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      last,
    }: Parameters<Handler<"drag", EventTypes["drag"]>>[0],
  ): void => {
    if (tap) {
      const now = Date.now();

      if (
        tileId === lastTap.current?.tileId &&
        now - lastTap.current.ts < 500
      ) {
        toggleFocus?.(items.find((i) => i.id === tileId)!);
        lastTap.current = null;
      } else {
        lastTap.current = { tileId, ts: now };
      }
    } else {
      const tileController = springRef.current.find(
        (c) => (c.item as Tile<T>).item.id === tileId,
      )!;

      if (canDragTile((tileController.item as Tile<T>).item)) {
        if (dragState.current === null) {
          const tileSpring = tileController.get();
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
    }
  };

  const onTileDragRef = useRef(onTileDrag);
  onTileDragRef.current = onTileDrag;

  const scrollOffset = useRef(0);

  useScroll(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    ({ xy: [, y], delta: [, dy] }) => {
      scrollOffset.current = y;

      if (dragState.current !== null) {
        dragState.current.tileY += dy;
        dragState.current.cursorY += dy;
        animateDraggedTile(false);
      }
    },
    { target: gridRef2 },
  );

  // Render nothing if the grid has yet to be generated
  if (grid === null) {
    return <div ref={gridRef} className={styles.grid} />;
  }

  return (
    <div ref={gridRef} className={styles.grid}>
      <div
        ref={setSlotsRoot}
        className={styles.slots}
        data-generation={generation}
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
          data={tile.item.data}
          {...spring}
        >
          {children as (props: ChildrenProperties<T>) => ReactNode}
        </TileWrapper>
      ))}
    </div>
  );
}
