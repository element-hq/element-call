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

import { SpotlightExpandedLayout as SpotlightExpandedLayoutModel } from "../state/CallViewModel";
import { CallLayout, GridTileModel, SpotlightTileModel } from "./CallLayout";
import { DragCallback, useUpdateLayout } from "./Grid";
import styles from "./SpotlightExpandedLayout.module.css";

/**
 * An implementation of the "expanded spotlight" layout, in which the spotlight
 * tile stretches edge-to-edge and is overlaid by a picture-in-picture tile.
 */
export const makeSpotlightExpandedLayout: CallLayout<
  SpotlightExpandedLayoutModel
> = ({ pipAlignment }) => ({
  scrollingOnTop: true,

  fixed: forwardRef(function SpotlightExpandedLayoutFixed(
    { model, Slot },
    ref,
  ) {
    useUpdateLayout();
    const spotlightTileModel: SpotlightTileModel = useMemo(
      () => ({ type: "spotlight", vms: model.spotlight, maximised: true }),
      [model.spotlight],
    );

    return (
      <div ref={ref} className={styles.layer}>
        <Slot
          className={styles.spotlight}
          id="spotlight"
          model={spotlightTileModel}
        />
      </div>
    );
  }),

  scrolling: forwardRef(function SpotlightExpandedLayoutScrolling(
    { model, Slot },
    ref,
  ) {
    useUpdateLayout();
    const pipAlignmentValue = useObservableEagerState(pipAlignment);

    const pipTileModel: GridTileModel | undefined = useMemo(
      () => model.pip && { type: "grid", vm: model.pip },
      [model.pip],
    );

    const onDragPip: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        pipAlignment.next({
          block: yRatio < 0.5 ? "start" : "end",
          inline: xRatio < 0.5 ? "start" : "end",
        }),
      [],
    );

    return (
      <div ref={ref} className={styles.layer}>
        {pipTileModel && (
          <Slot
            className={styles.pip}
            id="pip"
            model={pipTileModel}
            onDrag={onDragPip}
            data-block-alignment={pipAlignmentValue.block}
            data-inline-alignment={pipAlignmentValue.inline}
          />
        )}
      </div>
    );
  }),
});
