/*
Copyright 2022-2023 New Vector Ltd

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

import React, {
  ComponentProps,
  Key,
  Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  EventTypes,
  FullGestureState,
  Handler,
  useGesture,
} from "@use-gesture/react";
import {
  animated,
  SpringRef,
  SpringValues,
  useSprings,
} from "@react-spring/web";
import useMeasure from "react-use-measure";
import { ResizeObserver as JuggleResizeObserver } from "@juggle/resize-observer";

import styles from "./VideoGrid.module.css";
import { Layout } from "../room/GridLayoutMenu";
import { TileDescriptor } from "./TileDescriptor";
import { TileWrapper } from "./TileWrapper";

interface TilePosition {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface Tile {
  key: string;
  order: number;
  item: TileDescriptor;
  remove: boolean;
  focused: boolean;
  presenter: boolean;
}

export interface TileSpring {
  opacity: number;
  scale: number;
  shadow: number;
  shadowSpread: number;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

type LayoutDirection = "vertical" | "horizontal";

export function useVideoGridLayout(hasScreenshareFeeds: boolean): {
  layout: Layout;
  setLayout: (layout: Layout) => void;
} {
  const layoutRef = useRef<Layout>("freedom");
  const revertLayoutRef = useRef<Layout>("freedom");
  const prevHasScreenshareFeeds = useRef(hasScreenshareFeeds);
  const [, forceUpdate] = useState({});

  const setLayout = useCallback((layout: Layout) => {
    // Store the user's set layout to revert to after a screenshare is finished
    revertLayoutRef.current = layout;
    layoutRef.current = layout;
    forceUpdate({});
  }, []);

  // Note: We need the returned layout to update synchronously with a change in hasScreenshareFeeds
  // so use refs and avoid useEffect.
  if (prevHasScreenshareFeeds.current !== hasScreenshareFeeds) {
    if (hasScreenshareFeeds) {
      // Automatically switch to spotlight layout when there's a screenshare
      layoutRef.current = "spotlight";
    } else {
      // When the screenshares have ended, revert to the previous layout
      layoutRef.current = revertLayoutRef.current;
    }
  }

  prevHasScreenshareFeeds.current = hasScreenshareFeeds;

  return { layout: layoutRef.current, setLayout };
}

const GAP = 8;

function useIsMounted() {
  const isMountedRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}

function isInside([x, y]: number[], targetTile: TilePosition): boolean {
  const left = targetTile.x;
  const top = targetTile.y;
  const bottom = targetTile.y + targetTile.height;
  const right = targetTile.x + targetTile.width;

  if (x < left || x > right || y < top || y > bottom) {
    return false;
  }

  return true;
}

const getPipGap = (gridAspectRatio: number, gridWidth: number): number =>
  gridAspectRatio < 1 || gridWidth < 700 ? 12 : 24;

function getTilePositions(
  tileCount: number,
  focusedTileCount: number,
  hasPresenter: boolean,
  gridWidth: number,
  gridHeight: number,
  pipXRatio: number,
  pipYRatio: number,
  layout: Layout
): TilePosition[] {
  if (layout === "freedom") {
    if (tileCount === 2 && !hasPresenter && focusedTileCount === 0) {
      return getOneOnOneLayoutTilePositions(
        gridWidth,
        gridHeight,
        pipXRatio,
        pipYRatio
      );
    }

    return getFreedomLayoutTilePositions(
      tileCount,
      focusedTileCount,
      gridWidth,
      gridHeight
    );
  } else {
    return getSpotlightLayoutTilePositions(tileCount, gridWidth, gridHeight);
  }
}

function getOneOnOneLayoutTilePositions(
  gridWidth: number,
  gridHeight: number,
  pipXRatio: number,
  pipYRatio: number
): TilePosition[] {
  const [remotePosition] = getFreedomLayoutTilePositions(
    1,
    0,
    gridWidth,
    gridHeight
  );

  const gridAspectRatio = gridWidth / gridHeight;

  const smallPip = gridAspectRatio < 1 || gridWidth < 700;
  const maxPipWidth = smallPip ? 114 : 230;
  const maxPipHeight = smallPip ? 163 : 155;
  // Cap the PiP size at 1/3 the remote tile size, preserving aspect ratio
  const pipScaleFactor = Math.min(
    1,
    remotePosition.width / 3 / maxPipWidth,
    remotePosition.height / 3 / maxPipHeight
  );
  const pipWidth = maxPipWidth * pipScaleFactor;
  const pipHeight = maxPipHeight * pipScaleFactor;
  const pipGap = getPipGap(gridAspectRatio, gridWidth);

  const pipMinX = remotePosition.x + pipGap;
  const pipMinY = remotePosition.y + pipGap;
  const pipMaxX = remotePosition.x + remotePosition.width - pipWidth - pipGap;
  const pipMaxY = remotePosition.y + remotePosition.height - pipHeight - pipGap;

  return [
    {
      // Apply the PiP position as a proportion of the available space
      x: pipMinX + pipXRatio * (pipMaxX - pipMinX),
      y: pipMinY + pipYRatio * (pipMaxY - pipMinY),
      width: pipWidth,
      height: pipHeight,
      zIndex: 1,
    },
    remotePosition,
  ];
}

function getSpotlightLayoutTilePositions(
  tileCount: number,
  gridWidth: number,
  gridHeight: number
): TilePosition[] {
  const tilePositions: TilePosition[] = [];

  const gridAspectRatio = gridWidth / gridHeight;

  if (gridAspectRatio < 1) {
    // Vertical layout (mobile)
    const spotlightTileHeight =
      tileCount > 1 ? (gridHeight - GAP * 3) * (4 / 5) : gridHeight - GAP * 2;
    const spectatorTileSize =
      tileCount > 1 ? gridHeight - GAP * 3 - spotlightTileHeight : 0;

    for (let i = 0; i < tileCount; i++) {
      if (i === 0) {
        // Spotlight tile
        tilePositions.push({
          x: GAP,
          y: GAP,
          width: gridWidth - GAP * 2,
          height: spotlightTileHeight,
          zIndex: 0,
        });
      } else {
        // Spectator tile
        tilePositions.push({
          x: (GAP + spectatorTileSize) * (i - 1) + GAP,
          y: spotlightTileHeight + GAP * 2,
          width: spectatorTileSize,
          height: spectatorTileSize,
          zIndex: 0,
        });
      }
    }
  } else {
    // Horizontal layout (desktop)
    const spotlightTileWidth =
      tileCount > 1 ? ((gridWidth - GAP * 3) * 4) / 5 : gridWidth - GAP * 2;
    const spectatorTileWidth =
      tileCount > 1 ? gridWidth - GAP * 3 - spotlightTileWidth : 0;
    const spectatorTileHeight = spectatorTileWidth * (9 / 16);

    for (let i = 0; i < tileCount; i++) {
      if (i === 0) {
        tilePositions.push({
          x: GAP,
          y: GAP,
          width: spotlightTileWidth,
          height: gridHeight - GAP * 2,
          zIndex: 0,
        });
      } else {
        tilePositions.push({
          x: GAP * 2 + spotlightTileWidth,
          y: (GAP + spectatorTileHeight) * (i - 1) + GAP,
          width: spectatorTileWidth,
          height: spectatorTileHeight,
          zIndex: 0,
        });
      }
    }
  }

  return tilePositions;
}

function getFreedomLayoutTilePositions(
  tileCount: number,
  focusedTileCount: number,
  gridWidth: number,
  gridHeight: number
): TilePosition[] {
  if (tileCount === 0) {
    return [];
  }

  if (tileCount > 12) {
    console.warn("Over 12 tiles is not currently supported");
  }

  const { layoutDirection, itemGridRatio } = getGridLayout(
    tileCount,
    focusedTileCount,
    gridWidth,
    gridHeight
  );

  let itemGridWidth;
  let itemGridHeight;

  if (layoutDirection === "vertical") {
    itemGridWidth = gridWidth;
    itemGridHeight = Math.round(gridHeight * itemGridRatio);
  } else {
    itemGridWidth = Math.round(gridWidth * itemGridRatio);
    itemGridHeight = gridHeight;
  }

  const itemTileCount = tileCount - focusedTileCount;

  const {
    columnCount: itemColumnCount,
    rowCount: itemRowCount,
    tileAspectRatio: itemTileAspectRatio,
  } = getSubGridLayout(itemTileCount, itemGridWidth, itemGridHeight);

  const itemGridPositions = getSubGridPositions(
    itemTileCount,
    itemColumnCount,
    itemRowCount,
    itemTileAspectRatio,
    itemGridWidth,
    itemGridHeight
  );
  const itemGridBounds = getSubGridBoundingBox(itemGridPositions);

  let focusedGridWidth: number;
  let focusedGridHeight: number;

  if (focusedTileCount === 0) {
    focusedGridWidth = 0;
    focusedGridHeight = 0;
  } else if (layoutDirection === "vertical") {
    focusedGridWidth = gridWidth;
    focusedGridHeight =
      gridHeight - (itemGridBounds.height + (itemTileCount ? GAP * 2 : 0));
  } else {
    focusedGridWidth =
      gridWidth - (itemGridBounds.width + (itemTileCount ? GAP * 2 : 0));
    focusedGridHeight = gridHeight;
  }

  const {
    columnCount: focusedColumnCount,
    rowCount: focusedRowCount,
    tileAspectRatio: focusedTileAspectRatio,
  } = getSubGridLayout(focusedTileCount, focusedGridWidth, focusedGridHeight);

  const focusedGridPositions = getSubGridPositions(
    focusedTileCount,
    focusedColumnCount,
    focusedRowCount,
    focusedTileAspectRatio,
    focusedGridWidth,
    focusedGridHeight
  );

  const tilePositions = [...focusedGridPositions, ...itemGridPositions];

  centerTiles(focusedGridPositions, focusedGridWidth, focusedGridHeight, 0, 0);

  if (layoutDirection === "vertical") {
    centerTiles(
      itemGridPositions,
      gridWidth,
      gridHeight - focusedGridHeight,
      0,
      focusedGridHeight
    );
  } else {
    centerTiles(
      itemGridPositions,
      gridWidth - focusedGridWidth,
      gridHeight,
      focusedGridWidth,
      0
    );
  }

  return tilePositions;
}

function getSubGridBoundingBox(positions: TilePosition[]): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
} {
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;

  for (let i = 0; i < positions.length; i++) {
    const { x, y, width, height } = positions[i];

    if (i === 0) {
      left = x;
      right = x + width;
      top = y;
      bottom = y + height;
    } else {
      if (x < left) {
        left = x;
      }

      if (y < top) {
        top = y;
      }

      if (x + width > right) {
        right = x + width;
      }

      if (y + height > bottom) {
        bottom = y + height;
      }
    }
  }

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function isMobileBreakpoint(gridWidth: number, gridHeight: number): boolean {
  const gridAspectRatio = gridWidth / gridHeight;
  return gridAspectRatio < 1;
}

function getGridLayout(
  tileCount: number,
  focusedTileCount: number,
  gridWidth: number,
  gridHeight: number
): { itemGridRatio: number; layoutDirection: LayoutDirection } {
  let layoutDirection: LayoutDirection = "horizontal";
  let itemGridRatio = 1;

  if (focusedTileCount === 0) {
    return { itemGridRatio, layoutDirection };
  }

  if (isMobileBreakpoint(gridWidth, gridHeight)) {
    layoutDirection = "vertical";
    itemGridRatio = 1 / 3;
  } else {
    layoutDirection = "horizontal";
    itemGridRatio = 1 / 3;
  }

  return { itemGridRatio, layoutDirection };
}

function centerTiles(
  positions: TilePosition[],
  gridWidth: number,
  gridHeight: number,
  offsetLeft: number,
  offsetTop: number
) {
  const bounds = getSubGridBoundingBox(positions);

  const leftOffset = Math.round((gridWidth - bounds.width) / 2) + offsetLeft;
  const topOffset = Math.round((gridHeight - bounds.height) / 2) + offsetTop;

  applyTileOffsets(positions, leftOffset, topOffset);

  return positions;
}

function applyTileOffsets(
  positions: TilePosition[],
  leftOffset: number,
  topOffset: number
) {
  for (const position of positions) {
    position.x += leftOffset;
    position.y += topOffset;
  }

  return positions;
}

function getSubGridLayout(
  tileCount: number,
  gridWidth: number,
  gridHeight: number
): { columnCount: number; rowCount: number; tileAspectRatio: number } {
  const gridAspectRatio = gridWidth / gridHeight;

  let columnCount: number;
  let rowCount: number;
  let tileAspectRatio: number = 16 / 9;

  if (gridAspectRatio < 3 / 4) {
    // Phone
    if (tileCount === 1) {
      columnCount = 1;
      rowCount = 1;
      tileAspectRatio = 0;
    } else if (tileCount <= 4) {
      columnCount = 1;
      rowCount = tileCount;
    } else if (tileCount <= 12) {
      columnCount = 2;
      rowCount = Math.ceil(tileCount / columnCount);
      tileAspectRatio = 0;
    } else {
      // Unsupported
      columnCount = 3;
      rowCount = Math.ceil(tileCount / columnCount);
      tileAspectRatio = 1;
    }
  } else if (gridAspectRatio < 1) {
    // Tablet
    if (tileCount === 1) {
      columnCount = 1;
      rowCount = 1;
      tileAspectRatio = 0;
    } else if (tileCount <= 4) {
      columnCount = 1;
      rowCount = tileCount;
    } else if (tileCount <= 12) {
      columnCount = 2;
      rowCount = Math.ceil(tileCount / columnCount);
    } else {
      // Unsupported
      columnCount = 3;
      rowCount = Math.ceil(tileCount / columnCount);
      tileAspectRatio = 1;
    }
  } else if (gridAspectRatio < 17 / 9) {
    // Computer
    if (tileCount === 1) {
      columnCount = 1;
      rowCount = 1;
    } else if (tileCount === 2) {
      columnCount = 2;
      rowCount = 1;
    } else if (tileCount <= 4) {
      columnCount = 2;
      rowCount = 2;
    } else if (tileCount <= 6) {
      columnCount = 3;
      rowCount = 2;
    } else if (tileCount <= 8) {
      columnCount = 4;
      rowCount = 2;
      tileAspectRatio = 1;
    } else if (tileCount <= 12) {
      columnCount = 4;
      rowCount = 3;
      tileAspectRatio = 1;
    } else {
      // Unsupported
      columnCount = 4;
      rowCount = 4;
    }
  } else if (gridAspectRatio <= 32 / 9) {
    // Ultrawide
    if (tileCount === 1) {
      columnCount = 1;
      rowCount = 1;
    } else if (tileCount === 2) {
      columnCount = 2;
      rowCount = 1;
    } else if (tileCount <= 4) {
      columnCount = 2;
      rowCount = 2;
    } else if (tileCount <= 6) {
      columnCount = 3;
      rowCount = 2;
    } else if (tileCount <= 8) {
      columnCount = 4;
      rowCount = 2;
    } else if (tileCount <= 12) {
      columnCount = 4;
      rowCount = 3;
    } else {
      // Unsupported
      columnCount = 4;
      rowCount = 4;
    }
  } else {
    // Super Ultrawide
    if (tileCount <= 6) {
      columnCount = tileCount;
      rowCount = 1;
    } else {
      columnCount = Math.ceil(tileCount / 2);
      rowCount = 2;
    }
  }

  return { columnCount, rowCount, tileAspectRatio };
}

function getSubGridPositions(
  tileCount: number,
  columnCount: number,
  rowCount: number,
  tileAspectRatio: number,
  gridWidth: number,
  gridHeight: number
) {
  if (tileCount === 0) {
    return [];
  }

  const newTilePositions: TilePosition[] = [];

  const boxWidth = Math.round(
    (gridWidth - GAP * (columnCount + 1)) / columnCount
  );
  const boxHeight = Math.round((gridHeight - GAP * (rowCount + 1)) / rowCount);

  let tileWidth: number;
  let tileHeight: number;

  if (tileAspectRatio) {
    const boxAspectRatio = boxWidth / boxHeight;

    if (boxAspectRatio > tileAspectRatio) {
      tileWidth = boxHeight * tileAspectRatio;
      tileHeight = boxHeight;
    } else {
      tileWidth = boxWidth;
      tileHeight = boxWidth / tileAspectRatio;
    }
  } else {
    tileWidth = boxWidth;
    tileHeight = boxHeight;
  }

  for (let i = 0; i < tileCount; i++) {
    const verticalIndex = Math.floor(i / columnCount);
    const top = verticalIndex * GAP + verticalIndex * tileHeight;

    let rowItemCount: number;

    if (verticalIndex + 1 === rowCount && tileCount % columnCount !== 0) {
      rowItemCount = tileCount % columnCount;
    } else {
      rowItemCount = columnCount;
    }

    const horizontalIndex = i % columnCount;

    let centeringPadding = 0;

    if (rowItemCount < columnCount) {
      const subgridWidth = tileWidth * columnCount + (GAP * columnCount - 1);
      centeringPadding = Math.round(
        (subgridWidth - (tileWidth * rowItemCount + (GAP * rowItemCount - 1))) /
          2
      );
    }

    const left =
      centeringPadding + GAP * horizontalIndex + tileWidth * horizontalIndex;

    newTilePositions.push({
      width: tileWidth,
      height: tileHeight,
      x: left,
      y: top,
      zIndex: 0,
    });
  }

  return newTilePositions;
}

// Sets the 'order' property on tiles based on the layout param and
// other properties of the tiles, eg. 'focused' and 'presenter'
function reorderTiles(tiles: Tile[], layout: Layout) {
  // We use a special layout for 1:1 to always put the local tile first.
  // We only do this if there are two tiles (obviously) and exactly one
  // of them is local: during startup we can have tiles from other users
  // but not our own, due to the order they're added, so without this we
  // can assign multiple remote tiles order '1' and this persists through
  // subsequent reorders because we preserve the order of the tiles.
  if (
    layout === "freedom" &&
    tiles.length === 2 &&
    tiles.filter((t) => t.item.isLocal).length === 1 &&
    !tiles.some((t) => t.presenter || t.focused)
  ) {
    // 1:1 layout
    tiles.forEach((tile) => (tile.order = tile.item.isLocal ? 0 : 1));
  } else {
    const focusedTiles: Tile[] = [];
    const otherTiles: Tile[] = [];

    const orderedTiles: Tile[] = new Array(tiles.length);
    tiles.forEach((tile) => (orderedTiles[tile.order] = tile));

    orderedTiles.forEach((tile) =>
      (tile.focused ? focusedTiles : otherTiles).push(tile)
    );

    [...focusedTiles, ...otherTiles].forEach((tile, i) => (tile.order = i));
  }
}

interface DragTileData {
  offsetX: number;
  offsetY: number;
  key: Key;
  x: number;
  y: number;
}

export interface ChildrenProperties {
  ref: Ref<HTMLElement>;
  style: ComponentProps<typeof animated.div>["style"];
  /**
   * The width this tile will have once its animations have settled.
   */
  targetWidth: number;
  /**
   * The height this tile will have once its animations have settled.
   */
  targetHeight: number;
  item: TileDescriptor;
}

export interface VideoGridProps {
  items: TileDescriptor[];
  layout: Layout;
  disableAnimations?: boolean;
  children: (props: ChildrenProperties) => React.ReactNode;
}

export function VideoGrid({
  items,
  layout,
  disableAnimations,
  children,
}: VideoGridProps) {
  // Place the PiP in the bottom right corner by default
  const [pipXRatio, setPipXRatio] = useState(1);
  const [pipYRatio, setPipYRatio] = useState(1);

  const [{ tiles, tilePositions }, setTileState] = useState<{
    tiles: Tile[];
    tilePositions: TilePosition[];
  }>({
    tiles: [],
    tilePositions: [],
  });
  const [scrollPosition, setScrollPosition] = useState<number>(0);
  const draggingTileRef = useRef<DragTileData>(null);
  const lastTappedRef = useRef<{ [index: Key]: number }>({});
  const lastLayoutRef = useRef<Layout>(layout);
  const isMounted = useIsMounted();

  // The 'polyfill' argument to useMeasure is not a polyfill at all but is the impl that is always used
  // if passed, whether the browser has native support or not, so pass in either the browser native
  // version or the ponyfill (yes, pony) because Juggle's resizeobserver ponyfill is being weirdly
  // buggy for me on my dev env my never updating the size until the window resizes.
  const [gridRef, gridBounds] = useMeasure({
    polyfill: window.ResizeObserver ?? JuggleResizeObserver,
  });

  useEffect(() => {
    setTileState(({ tiles, ...rest }) => {
      const newTiles: Tile[] = [];
      const removedTileKeys: Set<Key> = new Set();

      for (const tile of tiles) {
        let item = items.find((item) => item.id === tile.key);

        let remove = false;

        if (!item) {
          remove = true;
          item = tile.item;
          removedTileKeys.add(tile.key);
        }

        let focused: boolean;
        if (layout === "spotlight") {
          focused = item.focused;
        } else {
          focused = layout === lastLayoutRef.current ? tile.focused : false;
        }

        newTiles.push({
          key: item.id,
          order: tile.order,
          item,
          remove,
          focused,
          presenter: item.presenter,
        });
      }

      for (const item of items) {
        const existingTileIndex = newTiles.findIndex(
          ({ key }) => item.id === key
        );

        const existingTile = newTiles[existingTileIndex];

        if (existingTile && !existingTile.remove) {
          continue;
        }

        const newTile: Tile = {
          key: item.id,
          order: existingTile?.order ?? newTiles.length,
          item,
          remove: false,
          focused: layout === "spotlight" && item.focused,
          presenter: item.presenter,
        };

        if (existingTile) {
          // Replace an existing tile
          newTiles.splice(existingTileIndex, 1, newTile);
        } else {
          // Added tiles
          newTiles.push(newTile);
        }
      }

      reorderTiles(newTiles, layout);

      if (removedTileKeys.size > 0) {
        setTimeout(() => {
          if (!isMounted.current) {
            return;
          }

          setTileState(({ tiles, ...rest }) => {
            const newTiles: Tile[] = tiles
              .filter((tile) => !removedTileKeys.has(tile.key))
              .map((tile) => ({ ...tile })); // clone before reordering
            reorderTiles(newTiles, layout);

            const focusedTileCount = newTiles.reduce(
              (count, tile) => count + (tile.focused ? 1 : 0),
              0
            );

            return {
              ...rest,
              tiles: newTiles,
              tilePositions: getTilePositions(
                newTiles.length,
                focusedTileCount,
                newTiles.some((t) => t.presenter),
                gridBounds.width,
                gridBounds.height,
                pipXRatio,
                pipYRatio,
                layout
              ),
            };
          });
        }, 250);
      }

      const focusedTileCount = newTiles.reduce(
        (count, tile) => count + (tile.focused ? 1 : 0),
        0
      );

      lastLayoutRef.current = layout;

      return {
        ...rest,
        tiles: newTiles,
        tilePositions: getTilePositions(
          newTiles.length,
          focusedTileCount,
          newTiles.some((t) => t.presenter),
          gridBounds.width,
          gridBounds.height,
          pipXRatio,
          pipYRatio,
          layout
        ),
      };
    });
  }, [items, gridBounds, layout, isMounted, pipXRatio, pipYRatio]);

  const tilePositionsValid = useRef(false);

  const animate = useCallback(
    (tiles: Tile[]) => {
      // Whether the tile positions were valid at the time of the previous
      // animation
      const tilePositionsWereValid = tilePositionsValid.current;
      const oneOnOneLayout =
        tiles.length === 2 && !tiles.some((t) => t.presenter || t.focused);

      return (tileIndex: number) => {
        const tile = tiles[tileIndex];
        const tilePosition = tilePositions[tile.order];
        const draggingTile = draggingTileRef.current;
        const dragging = draggingTile && tile.key === draggingTile.key;
        const remove = tile.remove;
        tilePositionsValid.current = tilePosition.height > 0;

        if (dragging) {
          return {
            width: tilePosition.width,
            height: tilePosition.height,
            x: draggingTile.offsetX + draggingTile.x,
            y: draggingTile.offsetY + draggingTile.y,
            scale: 1.1,
            opacity: 1,
            zIndex: 2,
            shadow: 15,
            shadowSpread: 0,
            immediate: (key: string) =>
              disableAnimations ||
              key === "zIndex" ||
              key === "x" ||
              key === "y" ||
              key === "shadow" ||
              key === "shadowSpread",
            from: {
              shadow: 0,
              scale: 0,
              opacity: 0,
              zIndex: 0,
            },
            reset: false,
          };
        } else {
          const isMobile = isMobileBreakpoint(
            gridBounds.width,
            gridBounds.height
          );

          const x =
            tilePosition.x +
            (layout === "spotlight" && tile.order !== 0 && isMobile
              ? scrollPosition
              : 0);
          const y =
            tilePosition.y +
            (layout === "spotlight" && tile.order !== 0 && !isMobile
              ? scrollPosition
              : 0);
          const from: {
            shadow: number;
            scale: number;
            opacity: number;
            zIndex?: number;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
          } = { shadow: 1, scale: 0, opacity: 0 };
          let reset = false;

          if (!tilePositionsWereValid) {
            // This indicates that the component just mounted. We discard the
            // previous keyframe by resetting the tile's position, so that it
            // animates in from the right place on screen, rather than wherever
            // the zero-height grid placed it.
            from.x = x;
            from.y = y;
            from.width = tilePosition.width;
            from.height = tilePosition.height;
            reset = true;
          }

          return {
            x,
            y,
            width: tilePosition.width,
            height: tilePosition.height,
            scale: remove ? 0 : 1,
            opacity: remove ? 0 : 1,
            zIndex: tilePosition.zIndex,
            shadow: 1,
            shadowSpread: oneOnOneLayout && tile.item.isLocal ? 1 : 0,
            from,
            reset,
            immediate: (key: string) =>
              disableAnimations ||
              key === "zIndex" ||
              key === "shadow" ||
              key === "shadowSpread",
            // If we just stopped dragging a tile, give it time for the
            // animation to settle before pushing its z-index back down
            delay: (key: string) => (key === "zIndex" ? 500 : 0),
          };
        }
      };
    },
    [tilePositions, disableAnimations, scrollPosition, layout, gridBounds]
  );

  const [springs, api] = useSprings(tiles.length, animate(tiles), [
    tilePositions,
    tiles,
    scrollPosition,
    // react-spring's types are bugged and can't infer the spring type
  ]) as unknown as [SpringValues<TileSpring>[], SpringRef<TileSpring>];

  const onTap = useCallback(
    (tileKey: Key) => {
      const lastTapped = lastTappedRef.current[tileKey];

      if (!lastTapped || Date.now() - lastTapped > 500) {
        lastTappedRef.current[tileKey] = Date.now();
        return;
      }

      lastTappedRef.current[tileKey] = 0;

      const tile = tiles.find((tile) => tile.key === tileKey);
      if (!tile || layout !== "freedom") return;
      const item = tile.item;

      setTileState(({ tiles, ...state }) => {
        let focusedTileCount = 0;
        const newTiles = tiles.map((tile) => {
          const newTile = { ...tile }; // clone before reordering

          if (tile.item === item) {
            newTile.focused = !tile.focused;
          }
          if (newTile.focused) {
            focusedTileCount++;
          }

          return newTile;
        });

        reorderTiles(newTiles, layout);

        return {
          ...state,
          tiles: newTiles,
          tilePositions: getTilePositions(
            newTiles.length,
            focusedTileCount,
            newTiles.some((t) => t.presenter),
            gridBounds.width,
            gridBounds.height,
            pipXRatio,
            pipYRatio,
            layout
          ),
        };
      });
    },
    [tiles, layout, gridBounds.width, gridBounds.height, pipXRatio, pipYRatio]
  );

  // Callback for useDrag. We could call useDrag here, but the default
  // pattern of spreading {...bind()} across the children to bind the gesture
  // ends up breaking memoization and ruining this component's performance.
  // Instead, we pass this callback to each tile via a ref, to let them bind the
  // gesture using the much more sensible ref-based method.
  const onTileDrag = (
    tileId: string,
    {
      active,
      xy,
      movement,
      tap,
      last,
      event,
    }: Parameters<Handler<"drag", EventTypes["drag"]>>[0]
  ) => {
    event.preventDefault();

    if (tap) {
      onTap(tileId);
      return;
    }

    if (layout !== "freedom") return;

    const dragTileIndex = tiles.findIndex((tile) => tile.key === tileId);
    const dragTile = tiles[dragTileIndex];
    const dragTilePosition = tilePositions[dragTile.order];

    const cursorPosition = [xy[0] - gridBounds.left, xy[1] - gridBounds.top];

    let newTiles = tiles;

    if (tiles.length === 2 && !tiles.some((t) => t.presenter || t.focused)) {
      // We're in 1:1 mode, so only the local tile should be draggable
      if (!dragTile.item.isLocal) return;

      // Position should only update on the very last event, to avoid
      // compounding the offset on every drag event
      if (last) {
        const remotePosition = tilePositions[1];

        const pipGap = getPipGap(
          gridBounds.width / gridBounds.height,
          gridBounds.width
        );
        const pipMinX = remotePosition.x + pipGap;
        const pipMinY = remotePosition.y + pipGap;
        const pipMaxX =
          remotePosition.x +
          remotePosition.width -
          dragTilePosition.width -
          pipGap;
        const pipMaxY =
          remotePosition.y +
          remotePosition.height -
          dragTilePosition.height -
          pipGap;

        const newPipXRatio =
          (dragTilePosition.x + movement[0] - pipMinX) / (pipMaxX - pipMinX);
        const newPipYRatio =
          (dragTilePosition.y + movement[1] - pipMinY) / (pipMaxY - pipMinY);

        setPipXRatio(Math.max(0, Math.min(1, newPipXRatio)));
        setPipYRatio(Math.max(0, Math.min(1, newPipYRatio)));
      }
    } else {
      const hoverTile = tiles.find(
        (tile) =>
          tile.key !== tileId &&
          isInside(cursorPosition, tilePositions[tile.order])
      );

      if (hoverTile) {
        // Shift the tiles into their new order
        newTiles = newTiles.map((tile) => {
          let order = tile.order;
          if (order < dragTile.order) {
            if (order >= hoverTile.order) order++;
          } else if (order > dragTile.order) {
            if (order <= hoverTile.order) order--;
          } else {
            order = hoverTile.order;
          }

          let focused;
          if (tile === hoverTile) {
            focused = dragTile.focused;
          } else if (tile === dragTile) {
            focused = hoverTile.focused;
          } else {
            focused = tile.focused;
          }

          return { ...tile, order, focused };
        });

        reorderTiles(newTiles, layout);

        setTileState((state) => ({ ...state, tiles: newTiles }));
      }
    }

    if (active) {
      if (!draggingTileRef.current) {
        draggingTileRef.current = {
          key: dragTile.key,
          offsetX: dragTilePosition.x,
          offsetY: dragTilePosition.y,
          x: movement[0],
          y: movement[1],
        };
      } else {
        draggingTileRef.current.x = movement[0];
        draggingTileRef.current.y = movement[1];
      }
    } else {
      draggingTileRef.current = null;
    }

    api.start(animate(newTiles));
  };

  const onTileDragRef = useRef(onTileDrag);
  onTileDragRef.current = onTileDrag;

  const onGridGesture = useCallback(
    (
      e:
        | Omit<FullGestureState<"wheel">, "event">
        | Omit<FullGestureState<"drag">, "event">,
      isWheel: boolean
    ) => {
      if (layout !== "spotlight") {
        return;
      }

      const isMobile = isMobileBreakpoint(gridBounds.width, gridBounds.height);

      let movement = e.delta[isMobile ? 0 : 1];

      if (isWheel) {
        movement = -movement;
      }

      let min = 0;

      if (tilePositions.length > 1) {
        const lastTile = tilePositions[tilePositions.length - 1];
        min = isMobile
          ? gridBounds.width - lastTile.x - lastTile.width - GAP
          : gridBounds.height - lastTile.y - lastTile.height - GAP;
      }

      setScrollPosition((scrollPosition) =>
        Math.min(Math.max(movement + scrollPosition, min), 0)
      );
    },
    [layout, gridBounds, tilePositions]
  );

  const bindGrid = useGesture(
    {
      onWheel: (e) => onGridGesture(e, true),
      onDrag: (e) => onGridGesture(e, false),
    },
    {}
  );

  return (
    <div className={styles.videoGrid} ref={gridRef} {...bindGrid()}>
      {springs.map((spring, i) => {
        const tile = tiles[i];
        const tilePosition = tilePositions[tile.order];

        return (
          <TileWrapper
            key={tile.key}
            id={tile.key}
            onDragRef={onTileDragRef}
            targetWidth={tilePosition.width}
            targetHeight={tilePosition.height}
            item={tile.item}
            {...spring}
          >
            {children}
          </TileWrapper>
        );
      })}
    </div>
  );
}

VideoGrid.defaultProps = {
  layout: "freedom",
};
