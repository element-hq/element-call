/*
Copyright 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useCallback } from "react";
import classNames from "classnames";

import { type OneOnOnePortraitLayout as OneOnOnePortraitLayoutModel } from "../state/layout-types.ts";
import { type CallLayout } from "./CallLayout";
import styles from "./OneOnOnePortraitLayout.module.css";
import { type DragCallback, useUpdateLayout } from "./Grid";
import { useBehavior } from "../useBehavior";

/**
 * An implementation of the "one-on-one" layout for portrait screens, in which
 * the remote participant is shown at maximum size, overlaid by a small view of
 * the local participant.
 */
export const makeOneOnOnePortraitLayout: CallLayout<
  OneOnOnePortraitLayoutModel
> = () => ({
  foreground: "scrolling",

  fixed: function OneOnOnePortraitLayoutFixed({ ref, model, Slot }): ReactNode {
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
  },

  scrolling: function OneOnOnePortraitLayoutScrolling({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    const pipSize = useBehavior(model.pipSize$);
    const pipAlignment = useBehavior(model.pipAlignment$);
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
        {model.pip && (
          <Slot
            className={classNames(styles.pip)}
            id={model.pip.id}
            model={model.pip}
            onDrag={onDragLocalTile}
            data-size={pipSize}
            data-block-alignment={pipAlignment.block}
            data-inline-alignment={pipAlignment.inline}
          />
        )}
      </div>
    );
  },
});
