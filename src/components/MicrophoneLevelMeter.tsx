/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useState, type FC, type Ref } from "react";
import { Text } from "@vector-im/compound-web";
import { MicOnIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

import { distinctUntilChanged, map } from "rxjs";

import styles from "./MicrophoneLevelMeter.module.css";
import { METER_SEGMENTS, type MicrophoneState } from "../state/MicrophoneLevel";
import { observeElementSize$ } from "../utils/elementSize";

export interface MicrophoneLevelMeterProps {
  state: MicrophoneState;
  className?: string;
  /**
   * The meter's own element. Its height is what a scroll container has to keep
   * clear to stop the meter covering the row it has just scrolled to.
   */
  ref?: Ref<HTMLDivElement>;
}

/**
 * The live input level of the selected microphone, shown beneath it.
 *
 * It says whether the microphone is picking anything up, which is not the same
 * as whether the user is being heard: it keeps moving while muted, and the mute
 * control is what says nothing is transmitted.
 */
export const MicrophoneLevelMeter: FC<MicrophoneLevelMeterProps> = ({
  state,
  className,
  ref,
}) => {
  const { t } = useTranslation();
  // How many bars there is room for. The bars never change size, so this is
  // what absorbs a change of width. Starts at the full count so that the first
  // paint is a meter rather than a single bar, and so that a renderer with no
  // layout at all — jsdom — still draws the whole thing.
  const [barCount, setBarCount] = useState(METER_SEGMENTS);
  const track = useCallback(
    (element: HTMLDivElement | null): (() => void) | undefined => {
      if (element === null) return;
      const subscription = observeElementSize$(element)
        .pipe(
          map(({ width }) => barsThatFit(element, width)),
          distinctUntilChanged(),
        )
        .subscribe(setBarCount);
      return (): void => subscription.unsubscribe();
    },
    [],
  );

  if (state.type !== "level")
    return (
      <div ref={ref} className={classNames(styles.meter, className)}>
        <MicOnIcon width={24} height={24} className={styles.icon} aria-hidden />
        <Text size="sm" className={styles.message}>
          {state.type === "permission-denied"
            ? t("microphone_level.permission_denied")
            : t("microphone_level.no_device")}
        </Text>
      </div>
    );

  return (
    <div ref={ref} className={classNames(styles.meter, className)}>
      <MicOnIcon width={24} height={24} className={styles.icon} aria-hidden />
      <div
        ref={track}
        className={styles.segments}
        role="meter"
        aria-label={t("microphone_level.label")}
        aria-valuemin={0}
        aria-valuemax={METER_SEGMENTS}
        aria-valuenow={state.level}
        aria-valuetext={t("microphone_level.value", {
          level: state.level,
          max: METER_SEGMENTS,
        })}
      >
        {Array.from({ length: barCount }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={classNames(styles.segment, {
              // The level is a share of the scale, not a number of bars: how
              // many bars stand for it depends on how many there are.
              [styles.segmentLit]:
                i < Math.round((state.level / METER_SEGMENTS) * barCount),
            })}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * How many bars fit across `width`, at the size the stylesheet draws them.
 *
 * Measured off a rendered bar rather than told: the size of a bar and of the
 * space beside it are a design question, settled in the stylesheet, and reading
 * them back is what keeps them from being settled twice.
 */
function barsThatFit(track: HTMLElement, width: number): number {
  const gap = Number.parseFloat(getComputedStyle(track).columnGap);
  const bar = track.firstElementChild?.getBoundingClientRect().width ?? 0;
  // A renderer that lays nothing out tells us nothing; keep the full count.
  if (!(bar > 0) || !(gap >= 0)) return METER_SEGMENTS;
  return Math.max(1, Math.floor((width + gap) / (bar + gap)));
}
