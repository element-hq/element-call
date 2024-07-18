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

import { CallLayout, GridTileModel, TileModel } from "./CallLayout";
import { SpotlightLayout as SpotlightLayoutModel } from "../state/CallViewModel";
import styles from "./SpotlightLayout.module.css";
import { useReactiveState } from "../useReactiveState";

interface GridCSSProperties extends CSSProperties {
  "--grid-columns": number;
}

interface Layout {
  orientation: "portrait" | "landscape";
  gridColumns: number;
}

function getLayout(gridLength: number, width: number): Layout {
  const orientation = width < 800 ? "portrait" : "landscape";
  return {
    orientation,
    gridColumns:
      orientation === "portrait"
        ? Math.floor(width / 190)
        : gridLength > 20
          ? 2
          : 1,
  };
}

export const makeSpotlightLayout: CallLayout<SpotlightLayoutModel> = ({
  minBounds,
}) => ({
  fixed: forwardRef(function SpotlightLayoutFixed({ model, Slot }, ref) {
    const { width, height } = useObservableEagerState(minBounds);
    const layout = getLayout(model.grid.length, width);
    const tileModel: TileModel = useMemo(
      () => ({
        type: "spotlight",
        vms: model.spotlight,
        maximised: layout.orientation === "portrait",
      }),
      [model.spotlight, layout.orientation],
    );
    const [generation] = useReactiveState<number>(
      (prev) => (prev === undefined ? 0 : prev + 1),
      [model.grid.length, width, height],
    );

    return (
      <div
        ref={ref}
        data-generation={generation}
        data-orientation={layout.orientation}
        className={classNames(styles.layer, styles.fixed)}
        style={
          { "--grid-columns": layout.gridColumns, height } as GridCSSProperties
        }
      >
        <div className={styles.spotlight}>
          <Slot className={styles.slot} id="spotlight" model={tileModel} />
        </div>
        <div className={styles.grid} />
      </div>
    );
  }),

  scrolling: forwardRef(function SpotlightLayoutScrolling(
    { model, Slot },
    ref,
  ) {
    const { width, height } = useObservableEagerState(minBounds);
    const layout = getLayout(model.grid.length, width);
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
        data-orientation={layout.orientation}
        className={classNames(styles.layer, styles.scrolling)}
        style={{ "--grid-columns": layout.gridColumns } as GridCSSProperties}
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
