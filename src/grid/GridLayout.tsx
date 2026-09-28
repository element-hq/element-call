/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useMemo,
} from "react";

import { type GridLayout as GridLayoutModel } from "../state/layout-types.ts";
import styles from "./GridLayout.module.css";
import { type CallLayout, arrangeTiles } from "./CallLayout";
import { type DragCallback, useUpdateLayout, useVisibleTiles } from "./Grid";
import { useBehavior } from "../useBehavior";

interface GridCSSProperties extends CSSProperties {
  "--gap": string;
  "--width": string;
  "--height": string;
}

/**
 * An implementation of the "grid" layout, in which all participants are shown
 * together in a scrolling grid.
 */
export const makeGridLayout: CallLayout<GridLayoutModel> = ({
  minBounds$,
}) => ({
  foreground: "fixed",

  // The "fixed" (non-scrolling) part of the layout is where the spotlight tile
  // lives
  fixed: function GridLayoutFixed({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const alignment = useBehavior(model.spotlightAlignment$);

    const onDragSpotlight: DragCallback = useCallback(
      ({ xRatio, yRatio }) => {
        const block = yRatio < 0.5 ? "start" : "end";
        const inline = xRatio < 0.5 ? "start" : "end";
        // A drag reports the same alignment on every move; only a change is
        // worth a re-render
        const current = model.spotlightAlignment$.value;
        if (current.block !== block || current.inline !== inline)
          model.spotlightAlignment$.next({ block, inline });
      },
      [model.spotlightAlignment$],
    );

    return (
      <div ref={ref} className={styles.fixed}>
        {model.spotlight && (
          <Slot
            className={styles.slot}
            id="spotlight"
            model={model.spotlight}
            onDrag={onDragSpotlight}
            data-block-alignment={alignment.block}
            data-inline-alignment={alignment.inline}
          />
        )}
      </div>
    );
  },

  // The scrolling part of the layout is where all the grid tiles live
  scrolling: function GridLayout({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    useVisibleTiles(model.setVisibleTiles);
    const { width, height: minHeight } = useBehavior(minBounds$);
    const { gap, tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, minHeight, model.grid.length),
      [width, minHeight, model.grid.length],
    );

    return (
      <div
        ref={ref}
        className={styles.scrolling}
        style={
          {
            width,
            "--gap": `${gap}px`,
            "--width": `${Math.floor(tileWidth)}px`,
            "--height": `${Math.floor(tileHeight)}px`,
          } as GridCSSProperties
        }
      >
        {model.grid.map((m) => (
          <Slot key={m.id} className={styles.slot} id={m.id} model={m} />
        ))}
      </div>
    );
  },
});
