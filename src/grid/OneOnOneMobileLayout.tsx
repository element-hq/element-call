/*
Copyright 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ComponentType, type FC, type ReactNode } from "react";
import classNames from "classnames";

import { type OneOnOneMobileLayout as OneOnOneMobileLayoutModel } from "../state/layout-types.ts";
import { type CallLayout } from "./CallLayout";
import styles from "./OneOnOneMobileLayout.module.css";
import { type SlotProps, useUpdateLayout } from "./Grid";
import { useBehavior } from "../useBehavior";
import { type FloatingTile } from "../state/FloatingTile.ts";
import {
  type GridTileViewModel,
  type TileViewModel,
} from "../state/TileViewModel.ts";
import { type Behavior } from "../state/Behavior.ts";

interface PipSlotProps {
  model: FloatingTile & { vm: GridTileViewModel; size$: Behavior<"sm" | "lg"> };
  Slot: ComponentType<SlotProps<TileViewModel>>;
}

const PipSlot: FC<PipSlotProps> = ({ model, Slot }) => {
  useUpdateLayout();
  const size = useBehavior(model.size$);
  const alignment = useBehavior(model.alignment$);

  return (
    <Slot
      className={classNames(styles.pip)}
      id={model.vm.id}
      model={model.vm}
      onDrag={model.onDrag}
      data-size={size}
      data-block-alignment={alignment.block}
      data-inline-alignment={alignment.inline}
    />
  );
};

/**
 * An implementation of the "one-on-one" layout for mobile platforms, in which
 * the remote participant is shown at maximum size, overlaid by a small view of
 * the local participant.
 */
export const makeOneOnOneMobileLayout: CallLayout<
  OneOnOneMobileLayoutModel
> = () => ({
  foreground: "scrolling",

  fixed: function OneOnOneMobileLayoutFixed({ ref, model, Slot }): ReactNode {
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

  scrolling: function OneOnOneMobileLayoutScrolling({
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
