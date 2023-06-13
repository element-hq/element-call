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

import React, { FC, memo, ReactNode, RefObject, useRef } from "react";
import { EventTypes, Handler, useDrag } from "@use-gesture/react";
import { SpringValue, to } from "@react-spring/web";

import { TileDescriptor } from "./TileDescriptor";
import { ChildrenProperties } from "./VideoGrid";

interface Props {
  id: string;
  onDragRef: RefObject<
    (
      tileId: string,
      state: Parameters<Handler<"drag", EventTypes["drag"]>>[0]
    ) => void
  >;
  targetWidth: number;
  targetHeight: number;
  item: TileDescriptor;
  opacity: SpringValue<number>;
  scale: SpringValue<number>;
  shadow: SpringValue<number>;
  shadowSpread: SpringValue<number>;
  zIndex: SpringValue<number>;
  x: SpringValue<number>;
  y: SpringValue<number>;
  width: SpringValue<number>;
  height: SpringValue<number>;
  children: (props: ChildrenProperties) => ReactNode;
}

/**
 * A wrapper around a tile in a video grid. This component exists to decouple
 * child components from the grid.
 */
export const TileWrapper: FC<Props> = memo(
  ({
    id,
    onDragRef,
    targetWidth,
    targetHeight,
    item,
    opacity,
    scale,
    shadow,
    shadowSpread,
    zIndex,
    x,
    y,
    width,
    height,
    children,
  }) => {
    const ref = useRef<HTMLElement | null>(null);

    useDrag((state) => onDragRef?.current!(id, state), {
      target: ref,
      filterTaps: true,
      preventScroll: true,
    });

    return (
      <>
        {children({
          ref,
          style: {
            opacity,
            scale,
            zIndex,
            x,
            y,
            width,
            height,
            boxShadow: to(
              [shadow, shadowSpread],
              (s, ss) => `rgba(0, 0, 0, 0.5) 0px ${s}px ${2 * s}px ${ss}px`
            ),
          },
          targetWidth,
          targetHeight,
          item,
        })}
      </>
    );
  }
);
