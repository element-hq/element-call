/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type CSSProperties,
  type ReactNode,
  useMemo,
  type FC,
  type ComponentType,
} from "react";

import { type GridLayout as GridLayoutModel } from "../state/layout-types.ts";
import styles from "./GridLayout.module.css";
import { type CallLayout, arrangeTiles } from "./CallLayout";
import { type SlotProps, useUpdateLayout, useVisibleTiles } from "./Grid";
import { useBehavior } from "../useBehavior";
import {
  type SpotlightTileViewModel,
  type TileViewModel,
} from "../state/TileViewModel.ts";
import { type FloatingTile } from "../state/FloatingTile.ts";

interface GridCSSProperties extends CSSProperties {
  "--gap": string;
  "--width": string;
  "--height": string;
}

interface SpotlightSlotProps {
  model: FloatingTile & { vm: SpotlightTileViewModel };
  Slot: ComponentType<SlotProps<TileViewModel>>;
}

const SpotlightSlot: FC<SpotlightSlotProps> = ({ model, Slot }) => {
  useUpdateLayout();
  const alignment = useBehavior(model.alignment$);

  return (
    <Slot
      className={styles.slot}
      id="spotlight"
      model={model.vm}
      onDrag={model.onDrag}
      data-block-alignment={alignment.block}
      data-inline-alignment={alignment.inline}
    />
  );
};

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
    return (
      <div ref={ref} className={styles.fixed}>
        {model.spotlight && (
          <SpotlightSlot model={model.spotlight} Slot={Slot} />
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
