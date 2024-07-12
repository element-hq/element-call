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

import { ComponentType, memo, RefObject, useRef } from "react";
import { EventTypes, Handler, useDrag } from "@use-gesture/react";
import { SpringValue } from "@react-spring/web";
import classNames from "classnames";

import { TileProps } from "./Grid";
import styles from "./TileWrapper.module.css";

interface Props<M, R extends HTMLElement> {
  id: string;
  onDrag: RefObject<
    (
      tileId: string,
      state: Parameters<Handler<"drag", EventTypes["drag"]>>[0],
    ) => void
  > | null;
  targetWidth: number;
  targetHeight: number;
  model: M;
  Tile: ComponentType<TileProps<M, R>>;
  opacity: SpringValue<number>;
  scale: SpringValue<number>;
  zIndex: SpringValue<number>;
  x: SpringValue<number>;
  y: SpringValue<number>;
  width: SpringValue<number>;
  height: SpringValue<number>;
}

const TileWrapper_ = memo(
  <M, R extends HTMLElement>({
    id,
    onDrag,
    targetWidth,
    targetHeight,
    model,
    Tile,
    opacity,
    scale,
    zIndex,
    x,
    y,
    width,
    height,
  }: Props<M, R>) => {
    const ref = useRef<R | null>(null);

    useDrag((state) => onDrag?.current!(id, state), {
      target: ref,
      filterTaps: true,
      preventScroll: true,
    });

    return (
      <Tile
        ref={ref}
        className={classNames(styles.tile, { [styles.draggable]: onDrag })}
        style={{
          opacity,
          scale,
          zIndex,
          x,
          y,
          width,
          height,
        }}
        targetWidth={targetWidth}
        targetHeight={targetHeight}
        model={model}
      />
    );
  },
);

TileWrapper_.displayName = "TileWrapper";

/**
 * A wrapper around a tile in a video grid. This component exists to decouple
 * child components from the grid.
 */
// We pretend this component is a simple function rather than a
// NamedExoticComponent, because that's the only way we can fit in a type
// parameter
export const TileWrapper = TileWrapper_ as <M, R extends HTMLElement>(
  props: Props<M, R>,
) => JSX.Element;
