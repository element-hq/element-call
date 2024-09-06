/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { forwardRef, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import { CallLayout, GridTileModel, TileModel } from "./CallLayout";
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
    const tileModel: TileModel = useMemo(
      () => ({
        type: "spotlight",
        vms: model.spotlight,
        maximised: false,
      }),
      [model.spotlight],
    );

    return (
      <div ref={ref} className={styles.layer}>
        <div className={styles.spotlight}>
          <Slot className={styles.slot} id="spotlight" model={tileModel} />
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
    const tileModels: GridTileModel[] = useMemo(
      () => model.grid.map((vm) => ({ type: "grid", vm })),
      [model.grid],
    );

    return (
      <div ref={ref} className={styles.layer}>
        <div
          className={classNames(styles.spotlight, {
            [styles.withIndicators]: model.spotlight.length > 1,
          })}
        />
        <div className={styles.grid}>
          {tileModels.map((m) => (
            <Slot
              key={m.vm.id}
              className={styles.slot}
              id={m.vm.id}
              model={m}
            />
          ))}
        </div>
      </div>
    );
  }),
});
