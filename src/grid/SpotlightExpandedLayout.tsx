/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, type ComponentType, type FC } from "react";

import { type SpotlightExpandedLayout as SpotlightExpandedLayoutModel } from "../state/layout-types.ts";
import { type CallLayout } from "./CallLayout";
import { type SlotProps, useUpdateLayout } from "./Grid";
import styles from "./SpotlightExpandedLayout.module.css";
import { useBehavior } from "../useBehavior";
import { type FloatingTile } from "../state/FloatingTile.ts";
import {
  type GridTileViewModel,
  type TileViewModel,
} from "../state/TileViewModel.ts";

interface PipSlotProps {
  model: FloatingTile & { vm: GridTileViewModel };
  Slot: ComponentType<SlotProps<TileViewModel>>;
}

const PipSlot: FC<PipSlotProps> = ({ model, Slot }) => {
  useUpdateLayout();
  const alignment = useBehavior(model.alignment$);

  return (
    <Slot
      className={styles.pip}
      id={model.vm.id}
      model={model.vm}
      onDrag={model.onDrag}
      data-block-alignment={alignment.block}
      data-inline-alignment={alignment.inline}
    />
  );
};

/**
 * An implementation of the "expanded spotlight" layout, in which the spotlight
 * tile stretches edge-to-edge and is overlaid by a picture-in-picture tile.
 */
export const makeSpotlightExpandedLayout: CallLayout<
  SpotlightExpandedLayoutModel
> = () => ({
  foreground: "scrolling",

  fixed: function SpotlightExpandedLayoutFixed({
    ref,
    model,
    Slot,
  }): ReactNode {
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

  scrolling: function SpotlightExpandedLayoutScrolling({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    return (
      <div ref={ref} className={styles.layer}>
        {model.pip && <PipSlot model={model.pip} Slot={Slot} />}
      </div>
    );
  },
});
