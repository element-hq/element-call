/*
Copyright 2023-2024 New Vector Ltd

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

import {
  SpringRef,
  TransitionFn,
  animated,
  useTransition,
} from "@react-spring/web";
import { EventTypes, Handler, useScroll } from "@use-gesture/react";
import {
  CSSProperties,
  ComponentProps,
  ComponentType,
  FC,
  LegacyRef,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useMeasure from "react-use-measure";
import classNames from "classnames";

import styles from "./Grid.module.css";
import { useMergedRefs } from "../useMergedRefs";
import { TileWrapper } from "./TileWrapper";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { TileSpringUpdate } from "./LegacyGrid";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Tile<Model> extends Rect {
  id: string;
  model: Model;
}

interface TileSpring {
  opacity: number;
  scale: number;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  tileId: string;
  tileX: number;
  tileY: number;
  cursorX: number;
  cursorY: number;
}

interface SlotProps extends ComponentProps<"div"> {
  tile: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * An invisible "slot" for a tile to go in.
 */
export const Slot: FC<SlotProps> = ({ tile, style, className, ...props }) => (
  <div
    className={classNames(className, styles.slot)}
    data-tile={tile}
    style={style}
    {...props}
  />
);

export interface LayoutProps<Model, R extends HTMLElement> {
  ref: LegacyRef<R>;
  model: Model;
}

export interface TileProps<Model, R extends HTMLElement> {
  ref: LegacyRef<R>;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  /**
   * The width this tile will have once its animations have settled.
   */
  targetWidth: number;
  /**
   * The height this tile will have once its animations have settled.
   */
  targetHeight: number;
  model: Model;
}

interface Drag {
  /**
   * The X coordinate of the dragged tile in grid space.
   */
  x: number;
  /**
   * The Y coordinate of the dragged tile in grid space.
   */
  y: number;
  /**
   * The X coordinate of the dragged tile, as a scalar of the grid width.
   */
  xRatio: number;
  /**
   * The Y coordinate of the dragged tile, as a scalar of the grid height.
   */
  yRatio: number;
}

type DragCallback = (drag: Drag) => void;

export interface LayoutSystem<LayoutModel, TileModel, R extends HTMLElement> {
  /**
   * Defines the ID and model of each tile present in the layout.
   */
  tiles: (model: LayoutModel) => Map<string, TileModel>;
  /**
   * A component which creates an invisible layout grid of "slots" for tiles to
   * go in. The root element must have a data-generation attribute which
   * increments whenever the layout may have changed.
   */
  Layout: ComponentType<LayoutProps<LayoutModel, R>>;
  /**
   * Gets a drag callback for the tile with the given ID. If this is not
   * provided or it returns null, the tile is not draggable.
   */
  onDrag?: (model: LayoutModel, tile: string) => DragCallback | null;
}

interface Props<
  LayoutModel,
  TileModel,
  LayoutRef extends HTMLElement,
  TileRef extends HTMLElement,
> {
  /**
   * Data with which to populate the layout.
   */
  model: LayoutModel;
  /**
   * The system by which to arrange the layout and respond to interactions.
   */
  system: LayoutSystem<LayoutModel, TileModel, LayoutRef>;
  /**
   * The component used to render each tile in the layout.
   */
  Tile: ComponentType<TileProps<TileModel, TileRef>>;
  className?: string;
  style?: CSSProperties;
}

/**
 * A grid of animated tiles.
 */
export function Grid<
  LayoutModel,
  TileModel,
  LayoutRef extends HTMLElement,
  TileRef extends HTMLElement,
>({
  model,
  system: { tiles: getTileModels, Layout, onDrag },
  Tile,
  className,
  style,
}: Props<LayoutModel, TileModel, LayoutRef, TileRef>): ReactNode {
  // Overview: This component places tiles by rendering an invisible layout grid
  // of "slots" for tiles to go in. Once rendered, it uses the DOM API to get
  // the dimensions of each slot, feeding these numbers back into react-spring
  // to let the actual tiles move freely atop the layout.

  // To tell us when the layout has changed, the layout system increments its
  // data-generation attribute, which we watch with a MutationObserver.

  const [gridRef1, gridBounds] = useMeasure();
  const [gridRoot, gridRef2] = useState<HTMLElement | null>(null);
  const gridRef = useMergedRefs<HTMLElement>(gridRef1, gridRef2);

  const [layoutRoot, setLayoutRoot] = useState<HTMLElement | null>(null);
  const [generation, setGeneration] = useState<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const layoutRef = useCallback(
    (e: HTMLElement | null) => {
      setLayoutRoot(e);
      if (e !== null)
        setGeneration(parseInt(e.getAttribute("data-generation")!));
    },
    [setLayoutRoot, setGeneration],
  );

  useEffect(() => {
    if (layoutRoot !== null) {
      const observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "attributes")) {
          setGeneration(parseInt(layoutRoot.getAttribute("data-generation")!));
        }
      });

      observer.observe(layoutRoot, { attributes: true });
      return (): void => observer.disconnect();
    }
  }, [layoutRoot, setGeneration]);

  const slotRects = useMemo(() => {
    const rects = new Map<string, Rect>();

    if (layoutRoot !== null) {
      const slots = layoutRoot.getElementsByClassName(
        styles.slot,
      ) as HTMLCollectionOf<HTMLElement>;
      for (const slot of slots)
        rects.set(slot.getAttribute("data-tile")!, {
          x: slot.offsetLeft,
          y: slot.offsetTop,
          width: slot.offsetWidth,
          height: slot.offsetHeight,
        });
    }

    return rects;
    // The rects may change due to the grid being resized or rerendered, but
    // eslint can't statically verify this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutRoot, generation]);

  const tileModels = useMemo(
    () => getTileModels(model),
    [getTileModels, model],
  );

  // Combine the tile models and slots together to create placed tiles
  const tiles = useMemo<Tile<TileModel>[]>(() => {
    const items: Tile<TileModel>[] = [];
    for (const [id, model] of tileModels) {
      const rect = slotRects.get(id);
      if (rect !== undefined) items.push({ id, model, ...rect });
    }
    return items;
  }, [slotRects, tileModels]);

  const dragCallbacks = useMemo(
    () =>
      new Map(
        (function* (): Iterable<[string, DragCallback | null]> {
          if (onDrag !== undefined)
            for (const id of tileModels.keys()) yield [id, onDrag(model, id)];
        })(),
      ),
    [onDrag, tileModels, model],
  );

  // Drag state is stored in a ref rather than component state, because we use
  // react-spring's imperative API during gestures to improve responsiveness
  const dragState = useRef<DragState | null>(null);

  const [tileTransitions, springRef] = useTransition(
    tiles,
    () => ({
      key: ({ id }: Tile<TileModel>): string => id,
      from: ({ x, y, width, height }: Tile<TileModel>): TileSpringUpdate => ({
        opacity: 0,
        scale: 0,
        zIndex: 1,
        x,
        y,
        width,
        height,
        immediate: prefersReducedMotion,
      }),
      enter: { opacity: 1, scale: 1, immediate: prefersReducedMotion },
      update: ({
        id,
        x,
        y,
        width,
        height,
      }: Tile<TileModel>): TileSpringUpdate | null =>
        id === dragState.current?.tileId
          ? null
          : {
              x,
              y,
              width,
              height,
              immediate: prefersReducedMotion,
            },
      leave: { opacity: 0, scale: 0, immediate: prefersReducedMotion },
      config: { mass: 0.7, tension: 252, friction: 25 },
    }),
    // react-spring's types are bugged and can't infer the spring type
  ) as unknown as [
    TransitionFn<Tile<TileModel>, TileSpring>,
    SpringRef<TileSpring>,
  ];

  // Because we're using react-spring in imperative mode, we're responsible for
  // firing animations manually whenever the tiles array updates
  useEffect(() => {
    springRef.start();
  }, [tiles, springRef]);

  const animateDraggedTile = (
    endOfGesture: boolean,
    callback: DragCallback,
  ): void => {
    const { tileId, tileX, tileY } = dragState.current!;
    const tile = tiles.find((t) => t.id === tileId)!;

    springRef.current
      .find((c) => (c.item as Tile<TileModel>).id === tileId)
      ?.start(
        endOfGesture
          ? {
              scale: 1,
              zIndex: 1,
              x: tile.x,
              y: tile.y,
              width: tile.width,
              height: tile.height,
              immediate:
                prefersReducedMotion || ((key): boolean => key === "zIndex"),
              // Allow the tile's position to settle before pushing its
              // z-index back down
              delay: (key): number => (key === "zIndex" ? 500 : 0),
            }
          : {
              scale: 1.1,
              zIndex: 2,
              x: tileX,
              y: tileY,
              immediate:
                prefersReducedMotion ||
                ((key): boolean =>
                  key === "zIndex" || key === "x" || key === "y"),
            },
      );

    if (endOfGesture)
      callback({
        x: tileX,
        y: tileY,
        xRatio: tileX / (gridBounds.width - tile.width),
        yRatio: tileY / (gridBounds.height - tile.height),
      });
  };

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
    if (!tap) {
      const tileController = springRef.current.find(
        (c) => (c.item as Tile<TileModel>).id === tileId,
      )!;
      const callback = dragCallbacks.get(tileController.item.id);

      if (callback != null) {
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

        animateDraggedTile(last, callback);

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
        animateDraggedTile(false, onDrag!(model, dragState.current.tileId)!);
      }
    },
    { target: gridRoot ?? undefined },
  );

  return (
    <div
      ref={gridRef}
      className={classNames(className, styles.grid)}
      style={style}
    >
      <Layout ref={layoutRef} model={model} />
      {tileTransitions((spring, { id, model, width, height }) => (
        <TileWrapper
          key={id}
          id={id}
          onDrag={dragCallbacks.get(id) ? onTileDragRef : null}
          targetWidth={width}
          targetHeight={height}
          model={model}
          Tile={Tile}
          {...spring}
        />
      ))}
    </div>
  );
}
