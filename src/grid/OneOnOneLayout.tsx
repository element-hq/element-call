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

import { forwardRef, useCallback, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import { OneOnOneLayout as OneOnOneLayoutModel } from "../state/CallViewModel";
import { CallLayout, GridTileModel, arrangeTiles } from "./CallLayout";
import { useReactiveState } from "../useReactiveState";
import styles from "./OneOnOneLayout.module.css";
import { DragCallback } from "./Grid";

export const makeOneOnOneLayout: CallLayout<OneOnOneLayoutModel> = ({
  minBounds,
  pipAlignment,
}) => ({
  scrollingOnTop: false,

  fixed: forwardRef(function OneOnOneLayoutFixed(_props, ref) {
    return <div ref={ref} data-generation={0} />;
  }),

  scrolling: forwardRef(function OneOnOneLayoutScrolling({ model, Slot }, ref) {
    const { width, height } = useObservableEagerState(minBounds);
    const pipAlignmentValue = useObservableEagerState(pipAlignment);
    const { tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, height, 1),
      [width, height],
    );

    const [generation] = useReactiveState<number>(
      (prev) => (prev === undefined ? 0 : prev + 1),
      [width, height, pipAlignmentValue],
    );

    const remoteTileModel: GridTileModel = useMemo(
      () => ({ type: "grid", vm: model.remote }),
      [model.remote],
    );
    const localTileModel: GridTileModel = useMemo(
      () => ({ type: "grid", vm: model.local }),
      [model.local],
    );

    const onDragLocalTile: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        pipAlignment.next({
          block: yRatio < 0.5 ? "start" : "end",
          inline: xRatio < 0.5 ? "start" : "end",
        }),
      [],
    );

    return (
      <div ref={ref} data-generation={generation} className={styles.layer}>
        <Slot
          id={remoteTileModel.vm.id}
          model={remoteTileModel}
          className={styles.container}
          style={{ width: tileWidth, height: tileHeight }}
        >
          <Slot
            className={classNames(styles.slot, styles.local)}
            id={localTileModel.vm.id}
            model={localTileModel}
            onDrag={onDragLocalTile}
            data-block-alignment={pipAlignmentValue.block}
            data-inline-alignment={pipAlignmentValue.inline}
          />
        </Slot>
      </div>
    );
  }),
});
