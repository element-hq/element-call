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

import { CSSProperties, forwardRef } from "react";
import { useObservableEagerState } from "observable-hooks";

import { CallLayout } from "./CallLayout";
import { SpotlightLayout as SpotlightLayoutModel } from "../state/CallViewModel";
import { useReactiveState } from "../useReactiveState";
import styles from "./SpotlightLayout.module.css";
import { Slot } from "./Grid";

interface GridCSSProperties extends CSSProperties {
  "--grid-columns": number;
}

const getGridColumns = (gridLength: number): number =>
  gridLength > 20 ? 2 : 1;

export const makeSpotlightLayout: CallLayout<SpotlightLayoutModel> = ({
  minBounds,
}) => ({
  fixed: {
    tiles: (model) => new Map([["spotlight", model.spotlight]]),
    Layout: forwardRef(function SpotlightLayoutFixed({ model }, ref) {
      const { width, height } = useObservableEagerState(minBounds);
      const gridColumns = getGridColumns(model.grid.length);
      const [generation] = useReactiveState<number>(
        (prev) => (prev === undefined ? 0 : prev + 1),
        [model.grid.length, width, height],
      );

      return (
        <div
          ref={ref}
          data-generation={generation}
          className={styles.fixed}
          style={{ "--grid-columns": gridColumns, height } as GridCSSProperties}
        >
          <div className={styles.spotlight}>
            <Slot className={styles.slot} tile="spotlight" />
          </div>
          <div className={styles.grid} />
        </div>
      );
    }),
  },

  scrolling: {
    tiles: (model) => new Map(model.grid.map((tile) => [tile.id, tile])),
    Layout: forwardRef(function SpotlightLayoutScrolling({ model }, ref) {
      const { width, height } = useObservableEagerState(minBounds);
      const gridColumns = getGridColumns(model.grid.length);
      const [generation] = useReactiveState<number>(
        (prev) => (prev === undefined ? 0 : prev + 1),
        [model.grid, width, height],
      );

      return (
        <div
          ref={ref}
          data-generation={generation}
          className={styles.scrolling}
          style={{ "--grid-columns": gridColumns } as GridCSSProperties}
        >
          <div className={styles.spotlight} />
          <div className={styles.grid}>
            {model.grid.map((tile) => (
              <Slot key={tile.id} className={styles.slot} tile={tile.id} />
            ))}
          </div>
        </div>
      );
    }),
  },
});
