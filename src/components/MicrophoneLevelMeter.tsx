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
import { LEVEL_SCALE, type MicrophoneState } from "../state/MicrophoneLevel";
import { observeElementSize$ } from "../utils/elementSize";
import { useMicrophoneLevel } from "./useMicrophoneLevel";

export interface LiveMicrophoneLevelMeterProps {
  /** The microphone to listen to. */
  deviceId: string | undefined;
  /** Whether to hold a capture at all. */
  active: boolean;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The level meter, wired to a live capture of a microphone.
 *
 * A component of its own so that a level which does change redraws the meter
 * and not whatever is rendered beside it. A moving level arrives many times a
 * second; held in the menu, it would reconcile every device row on the way to
 * the bars.
 */
export const LiveMicrophoneLevelMeter: FC<LiveMicrophoneLevelMeterProps> = ({
  deviceId,
  active,
  className,
  ref,
}) => {
  const state = useMicrophoneLevel(deviceId, active);
  return <MicrophoneLevelMeter state={state} className={className} ref={ref} />;
};

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
 * The live input level of the selected microphone, shown beneath it, or the
 * reason there is no level to show.
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
  const [barCount, setBarCount] = useState(LEVEL_SCALE);
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

  return (
    <div ref={ref} className={classNames(styles.meter, className)}>
      <MicOnIcon className={styles.icon} aria-hidden />
      {state.type !== "level" ? (
        <Text size="sm" className={styles.message}>
          {state.type === "permission-denied"
            ? t("microphone_level.permission_denied")
            : t("microphone_level.no_device")}
        </Text>
      ) : (
        <div
          ref={track}
          className={styles.segments}
          role="meter"
          aria-label={t("microphone_level.label")}
          aria-valuemin={0}
          aria-valuemax={LEVEL_SCALE}
          aria-valuenow={state.level}
          aria-valuetext={t("microphone_level.value", {
            level: state.level,
            max: LEVEL_SCALE,
          })}
        >
          {Array.from({ length: barCount }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={classNames(styles.segment, {
                // The level is a share of the scale, not a count of bars: how
                // many stand for it depends on how many there are.
                [styles.segmentLit]:
                  i < Math.round((state.level / LEVEL_SCALE) * barCount),
              })}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * How many bars fit across `width`, measured off a rendered one rather than
 * told: a bar's size is a design question, settled in the stylesheet, and
 * reading it back is what keeps it from being settled twice.
 */
function barsThatFit(track: HTMLElement, width: number): number {
  const gap = Number.parseFloat(getComputedStyle(track).columnGap);
  const bar = track.firstElementChild?.getBoundingClientRect().width ?? 0;
  // A renderer that lays nothing out tells us nothing; keep the full count.
  if (!(bar > 0) || !(gap >= 0)) return LEVEL_SCALE;
  return Math.max(1, Math.floor((width + gap) / (bar + gap)));
}
