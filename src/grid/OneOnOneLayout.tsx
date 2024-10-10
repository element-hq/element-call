/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { forwardRef, useCallback, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import { OneOnOneLayout as OneOnOneLayoutModel } from "../state/CallViewModel";
import { CallLayout, arrangeTiles } from "./CallLayout";
import styles from "./OneOnOneLayout.module.css";
import { DragCallback, useUpdateLayout } from "./Grid";

/**
 * An implementation of the "one-on-one" layout, in which the remote participant
 * is shown at maximum size, overlaid by a small view of the local participant.
 */
export const makeOneOnOneLayout: CallLayout<OneOnOneLayoutModel> = ({
  minBounds,
  pipAlignment,
}) => ({
  scrollingOnTop: false,

  fixed: forwardRef(function OneOnOneLayoutFixed(_props, ref) {
    useUpdateLayout();
    return <div ref={ref} />;
  }),

  scrolling: forwardRef(function OneOnOneLayoutScrolling({ model, Slot }, ref) {
    useUpdateLayout();
    const { width, height } = useObservableEagerState(minBounds);
    const pipAlignmentValue = useObservableEagerState(pipAlignment);
    const { tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, height, 1),
      [width, height],
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
      <div ref={ref} className={styles.layer}>
        <Slot
          id={model.remote.id}
          model={model.remote}
          className={styles.container}
          style={{ width: tileWidth, height: tileHeight }}
        >
          <Slot
            className={classNames(styles.slot, styles.local)}
            id={model.local.id}
            model={model.local}
            onDrag={onDragLocalTile}
            data-block-alignment={pipAlignmentValue.block}
            data-inline-alignment={pipAlignmentValue.inline}
          />
        </Slot>
      </div>
    );
  }),
});
