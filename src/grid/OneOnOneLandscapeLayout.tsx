/*
Copyright 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useCallback, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import { type OneOnOneLandscapeLayout as OneOnOneLandscapeLayoutModel } from "../state/layout-types.ts";
import { type CallLayout, arrangeTiles } from "./CallLayout";
import styles from "./OneOnOneLandscapeLayout.module.css";
import { type DragCallback, useUpdateLayout } from "./Grid";
import { useBehavior } from "../useBehavior";

/**
 * An implementation of the "one-on-one" layout for landscape screens, in which
 * the remote participant is shown at maximum size, overlaid by a small view of
 * the local participant.
 */
export const makeOneOnOneLandscapeLayout: CallLayout<
  OneOnOneLandscapeLayoutModel
> = ({ minBounds$ }) => ({
  foreground: "fixed",

  fixed: function OneOnOneLandscapeLayoutFixed({ ref }): ReactNode {
    useUpdateLayout();
    return <div ref={ref} />;
  },

  scrolling: function OneOnOneLandscapeLayoutScrolling({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    const { width, height } = useObservableEagerState(minBounds$);
    const pipAlignment = useBehavior(model.pipAlignment$);
    const { tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, height, 1),
      [width, height],
    );

    const onDragLocalTile: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        model.pipAlignment$.next({
          block: yRatio < 0.5 ? "start" : "end",
          inline: xRatio < 0.5 ? "start" : "end",
        }),
      [model.pipAlignment$],
    );

    return (
      <div ref={ref} className={styles.layer}>
        <Slot
          id={model.spotlight.id}
          model={model.spotlight}
          className={styles.container}
          style={{ width: tileWidth, height: tileHeight }}
        >
          <Slot
            className={classNames(styles.slot, styles.local)}
            id={model.pip.id}
            model={model.pip}
            onDrag={onDragLocalTile}
            data-block-alignment={pipAlignment.block}
            data-inline-alignment={pipAlignment.inline}
          />
        </Slot>
      </div>
    );
  },
});
