/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useCallback, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import { type OneOnOneLayout as OneOnOneLayoutModel } from "../state/layout-types.ts";
import { type CallLayout, arrangeTiles } from "./CallLayout";
import styles from "./OneOnOneLayout.module.css";
import { type DragCallback, useUpdateLayout } from "./Grid";
import { useBehavior } from "../useBehavior";

/**
 * An implementation of the "one-on-one" layout, in which the remote participant
 * is shown at maximum size, overlaid by a small view of the local participant.
 */
export const makeOneOnOneLayout: CallLayout<OneOnOneLayoutModel> = ({
  minBounds$,
  pipAlignment$,
}) => ({
  scrollingOnTop: false,

  fixed: function OneOnOneLayoutFixed({ ref }): ReactNode {
    useUpdateLayout();
    return <div ref={ref} />;
  },

  scrolling: function OneOnOneLayoutScrolling({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const { width, height } = useObservableEagerState(minBounds$);
    const pipAlignmentValue = useBehavior(pipAlignment$);
    const { tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, height, 1),
      [width, height],
    );

    const onDragLocalTile: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        pipAlignment$.next({
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
  },
});
