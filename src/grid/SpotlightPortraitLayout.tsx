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

import { CSSProperties, forwardRef, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import {
  CallLayout,
  GridTileModel,
  TileModel,
  arrangeTiles,
} from "./CallLayout";
import { SpotlightPortraitLayout as SpotlightPortraitLayoutModel } from "../state/CallViewModel";
import styles from "./SpotlightPortraitLayout.module.css";
import { useReactiveState } from "../useReactiveState";

interface GridCSSProperties extends CSSProperties {
  "--grid-gap": string;
  "--grid-tile-width": string;
  "--grid-tile-height": string;
}

/**
 * An implementation of the "spotlight portrait" layout, in which the spotlight
 * tile is shown across the top of the screen, and the grid of participants
 * scrolls behind it.
 */
export const makeSpotlightPortraitLayout: CallLayout<
  SpotlightPortraitLayoutModel
> = ({ minBounds }) => ({
  scrollingOnTop: false,

  fixed: forwardRef(function SpotlightPortraitLayoutFixed(
    { model, Slot },
    ref,
  ) {
    const { width, height } = useObservableEagerState(minBounds);
    const tileModel: TileModel = useMemo(
      () => ({
        type: "spotlight",
        vms: model.spotlight,
        maximised: true,
      }),
      [model.spotlight],
    );
    const [generation] = useReactiveState<number>(
      (prev) => (prev === undefined ? 0 : prev + 1),
      [model.grid.length, width, height, model.spotlight],
    );

    return (
      <div ref={ref} data-generation={generation} className={styles.layer}>
        <div className={styles.spotlight}>
          <Slot className={styles.slot} id="spotlight" model={tileModel} />
        </div>
      </div>
    );
  }),

  scrolling: forwardRef(function SpotlightPortraitLayoutScrolling(
    { model, Slot },
    ref,
  ) {
    const { width, height } = useObservableEagerState(minBounds);
    const { gap, tileWidth, tileHeight } = arrangeTiles(
      width,
      0,
      model.grid.length,
    );
    const tileModels: GridTileModel[] = useMemo(
      () => model.grid.map((vm) => ({ type: "grid", vm })),
      [model.grid],
    );
    const [generation] = useReactiveState<number>(
      (prev) => (prev === undefined ? 0 : prev + 1),
      [model.spotlight.length, model.grid, width, height],
    );

    return (
      <div
        ref={ref}
        data-generation={generation}
        className={styles.layer}
        style={
          {
            "--grid-gap": `${gap}px`,
            "--grid-tile-width": `${Math.floor(tileWidth)}px`,
            "--grid-tile-height": `${Math.floor(tileHeight)}px`,
          } as GridCSSProperties
        }
      >
        <div
          className={classNames(styles.spotlight, {
            [styles.withIndicators]: model.spotlight.length > 1,
          })}
        />
        <div className={styles.grid}>
          {tileModels.map((m) => (
            <Slot
              key={m.vm.id}
              className={styles.slot}
              id={m.vm.id}
              model={m}
            />
          ))}
        </div>
      </div>
    );
  }),
});
