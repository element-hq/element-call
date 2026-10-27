/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode } from "react";
import classNames from "classnames";

import { type CallLayout } from "./CallLayout";
import { type SpotlightLandscapeLayout as SpotlightLandscapeLayoutModel } from "../state/layout-types.ts";
import styles from "./SpotlightLandscapeLayout.module.css";
import { useUpdateLayout, useVisibleTiles } from "./Grid";
import { type MediaViewModel } from "../state/media/MediaViewModel.ts";
import { type Behavior } from "../state/Behavior.ts";
import { useBehavior } from "../useBehavior.ts";

/**
 * An implementation of the "spotlight landscape" layout, in which the spotlight
 * tile takes up most of the space on the left, and the grid of participants is
 * shown as a scrolling rail on the right.
 */
export const makeSpotlightLandscapeLayout: CallLayout<
  SpotlightLandscapeLayoutModel
> = ({ minBounds$ }) => ({
  foreground: "scrolling",

  fixed: function SpotlightLandscapeLayoutFixed({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    useBehavior(minBounds$);

    return (
      <div ref={ref} className={styles.layer}>
        <div className={styles.spotlight}>
          <Slot
            className={styles.slot}
            id="spotlight"
            model={model.spotlight.vm}
          />
        </div>
        <div className={styles.grid} />
      </div>
    );
  },

  scrolling: function SpotlightLandscapeLayoutScrolling({
    ref,
    model,
    Slot,
  }): ReactNode {
    useUpdateLayout();
    useVisibleTiles(model.setVisibleTiles);
    useBehavior(minBounds$);

    return (
      <div ref={ref} className={styles.layer}>
        <SpotlightSlot media$={model.spotlight.vm.media$} />
        <div className={styles.grid}>
          {model.grid.map((m) => (
            <Slot key={m.id} className={styles.slot} id={m.id} model={m} />
          ))}
        </div>
      </div>
    );
  },
});

interface SpotlightSlotProps {
  media$: Behavior<MediaViewModel[]>;
}

// This component isolates the subscription to the spotlight media so that it
// can change without causing the whole layout to re-render
const SpotlightSlot: FC<SpotlightSlotProps> = ({ media$ }) => {
  const withIndicators = useBehavior(media$).length > 1;
  return (
    <div
      className={classNames(styles.spotlight, {
        [styles.withIndicators]: withIndicators,
      })}
    />
  );
};
