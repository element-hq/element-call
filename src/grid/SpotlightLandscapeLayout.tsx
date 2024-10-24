/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { forwardRef } from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import { CallLayout } from "./CallLayout";
import { SpotlightLandscapeLayout as SpotlightLandscapeLayoutModel } from "../state/CallViewModel";
import styles from "./SpotlightLandscapeLayout.module.css";
import { useUpdateLayout } from "./Grid";

/**
 * An implementation of the "spotlight landscape" layout, in which the spotlight
 * tile takes up most of the space on the left, and the grid of participants is
 * shown as a scrolling rail on the right.
 */
export const makeSpotlightLandscapeLayout: CallLayout<
  SpotlightLandscapeLayoutModel
> = ({ minBounds }) => ({
  scrollingOnTop: false,

  fixed: forwardRef(function SpotlightLandscapeLayoutFixed(
    { model, Slot },
    ref,
  ) {
    useUpdateLayout();
    useObservableEagerState(minBounds);

    return (
      <div ref={ref} className={styles.layer}>
        <div className={styles.spotlight}>
          <Slot
            className={styles.slot}
            id="spotlight"
            model={model.spotlight}
          />
        </div>
        <div className={styles.grid} />
      </div>
    );
  }),

  scrolling: forwardRef(function SpotlightLandscapeLayoutScrolling(
    { model, Slot },
    ref,
  ) {
    useUpdateLayout();
    useObservableEagerState(minBounds);
    const withIndicators =
      useObservableEagerState(model.spotlight.media).length > 1;

    return (
      <div ref={ref} className={styles.layer}>
        <div
          className={classNames(styles.spotlight, {
            [styles.withIndicators]: withIndicators,
          })}
        />
        <div className={styles.grid}>
          {model.grid.map((m) => (
            <Slot key={m.id} className={styles.slot} id={m.id} model={m} />
          ))}
        </div>
      </div>
    );
  }),
});
