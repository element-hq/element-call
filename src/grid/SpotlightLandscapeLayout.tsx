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

import { forwardRef, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import { CallLayout, GridTileModel, TileModel } from "./CallLayout";
import { SpotlightLandscapeLayout as SpotlightLandscapeLayoutModel } from "../state/CallViewModel";
import styles from "./SpotlightLandscapeLayout.module.css";
import { useReactiveState } from "../useReactiveState";

/**
 * An implementation of the "spotlight landscape" layout, in which the spotlight
 * tile takes up most of the space on the left, and the grid of participants is
 * shown as a scrolling rail on the right.
 */
export const makeSpotlightLandscapeLayout: CallLayout<
  SpotlightLandscapeLayoutModel
> = ({ minBounds }) => ({
  scrollingOnTop: false,

  fixed: forwardRef(function SpotlightLandscapeLayoutFixed(
    { model, Slot },
    ref,
  ) {
    const { width, height } = useObservableEagerState(minBounds);
    const tileModel: TileModel = useMemo(
      () => ({
        type: "spotlight",
        vms: model.spotlight,
        maximised: false,
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
        <div className={styles.grid} />
      </div>
    );
  }),

  scrolling: forwardRef(function SpotlightLandscapeLayoutScrolling(
    { model, Slot },
    ref,
  ) {
    const { width, height } = useObservableEagerState(minBounds);
    const tileModels: GridTileModel[] = useMemo(
      () => model.grid.map((vm) => ({ type: "grid", vm })),
      [model.grid],
    );
    const [generation] = useReactiveState<number>(
      (prev) => (prev === undefined ? 0 : prev + 1),
      [model.spotlight.length, model.grid, width, height],
    );

    return (
      <div ref={ref} data-generation={generation} className={styles.layer}>
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
