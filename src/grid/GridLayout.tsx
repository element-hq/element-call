/*
Copyright 2024 New Vector Ltd

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

import { CSSProperties, forwardRef, useCallback, useMemo } from "react";
import { distinctUntilChanged } from "rxjs";
import { useObservableEagerState } from "observable-hooks";

import { GridLayout as GridLayoutModel } from "../state/CallViewModel";
import styles from "./GridLayout.module.css";
import { useInitial } from "../useInitial";
import {
  CallLayout,
  GridTileModel,
  TileModel,
  arrangeTiles,
} from "./CallLayout";
import { DragCallback, useUpdateLayout } from "./Grid";

interface GridCSSProperties extends CSSProperties {
  "--gap": string;
  "--width": string;
  "--height": string;
}

/**
 * An implementation of the "grid" layout, in which all participants are shown
 * together in a scrolling grid.
 */
export const makeGridLayout: CallLayout<GridLayoutModel> = ({
  minBounds,
  spotlightAlignment,
}) => ({
  scrollingOnTop: false,

  // The "fixed" (non-scrolling) part of the layout is where the spotlight tile
  // lives
  fixed: forwardRef(function GridLayoutFixed({ model, Slot }, ref) {
    useUpdateLayout();
    const alignment = useObservableEagerState(
      useInitial(() =>
        spotlightAlignment.pipe(
          distinctUntilChanged(
            (a1, a2) => a1.block === a2.block && a1.inline === a2.inline,
          ),
        ),
      ),
    );
    const tileModel: TileModel | undefined = useMemo(
      () =>
        model.spotlight && {
          type: "spotlight",
          vms: model.spotlight,
          maximised: false,
        },
      [model.spotlight],
    );

    const onDragSpotlight: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        spotlightAlignment.next({
          block: yRatio < 0.5 ? "start" : "end",
          inline: xRatio < 0.5 ? "start" : "end",
        }),
      [],
    );

    return (
      <div ref={ref} className={styles.fixed}>
        {tileModel && (
          <Slot
            className={styles.slot}
            id="spotlight"
            model={tileModel}
            onDrag={onDragSpotlight}
            data-block-alignment={alignment.block}
            data-inline-alignment={alignment.inline}
          />
        )}
      </div>
    );
  }),

  // The scrolling part of the layout is where all the grid tiles live
  scrolling: forwardRef(function GridLayout({ model, Slot }, ref) {
    useUpdateLayout();
    const { width, height: minHeight } = useObservableEagerState(minBounds);
    const { gap, tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, minHeight, model.grid.length),
      [width, minHeight, model.grid.length],
    );

    const tileModels: GridTileModel[] = useMemo(
      () => model.grid.map((vm) => ({ type: "grid", vm })),
      [model.grid],
    );

    return (
      <div
        ref={ref}
        className={styles.scrolling}
        style={
          {
            width,
            "--gap": `${gap}px`,
            "--width": `${Math.floor(tileWidth)}px`,
            "--height": `${Math.floor(tileHeight)}px`,
          } as GridCSSProperties
        }
      >
        {tileModels.map((m) => (
          <Slot key={m.vm.id} className={styles.slot} id={m.vm.id} model={m} />
        ))}
      </div>
    );
  }),
});
