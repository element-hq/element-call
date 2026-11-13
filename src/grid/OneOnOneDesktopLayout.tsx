/*
Copyright 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useMemo } from "react";
import classNames from "classnames";

import { type OneOnOneDesktopLayout as OneOnOneDesktopLayoutModel } from "../state/layout-types.ts";
import { type CallLayout, arrangeTiles } from "./CallLayout";
import styles from "./OneOnOneDesktopLayout.module.css";
import { useUpdateLayout } from "./Grid";
import { useBehavior } from "../useBehavior";

/**
 * An implementation of the "one-on-one" layout for desktop platforms, in which
 * the remote participant is shown at maximum size, overlaid by a small view of
 * the local participant.
 */
export const makeOneOnOneDesktopLayout: CallLayout<
  OneOnOneDesktopLayoutModel
> = ({ minBounds$ }) => ({
  foreground: "fixed",

  fixed: function OneOnOneDesktopLayoutFixed({ ref }): ReactNode {
    useUpdateLayout();
    return <div ref={ref} />;
  },

  scrolling: function OneOnOneDesktopLayoutScrolling({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    const { width, height } = useBehavior(minBounds$);
    const pipAlignment = useBehavior(model.pip.alignment$);
    const { tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, height, 1),
      [width, height],
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
            id={model.pip.vm.id}
            model={model.pip.vm}
            onDrag={model.pip.onDrag}
            data-block-alignment={pipAlignment.block}
            data-inline-alignment={pipAlignment.inline}
          />
        </Slot>
      </div>
    );
  },
});
