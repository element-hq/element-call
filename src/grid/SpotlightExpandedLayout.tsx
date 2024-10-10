/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { forwardRef, useCallback } from "react";
import { useObservableEagerState } from "observable-hooks";

import { SpotlightExpandedLayout as SpotlightExpandedLayoutModel } from "../state/CallViewModel";
import { CallLayout } from "./CallLayout";
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

    return (
      <div ref={ref} className={styles.layer}>
        <Slot
          className={styles.spotlight}
          id="spotlight"
          model={model.spotlight}
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
        {model.pip && (
          <Slot
            className={styles.pip}
            id={model.pip.id}
            model={model.pip}
            onDrag={onDragPip}
            data-block-alignment={pipAlignmentValue.block}
            data-inline-alignment={pipAlignmentValue.inline}
          />
        )}
      </div>
    );
  }),
});
